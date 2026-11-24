package com.smarthealth.web;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.smarthealth.exception.AuthenticationException;
import java.math.BigInteger;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.security.KeyFactory;
import java.security.Signature;
import java.security.interfaces.RSAPublicKey;
import java.security.spec.RSAPublicKeySpec;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicReference;

/** Verifies Google Identity Services ID tokens using Google's rotating signing keys. */
public final class GoogleIdentityVerifier {
    public record Identity(String subject, String email, String name, boolean emailAuthoritative) {}
    private static final URI KEYS_URI = URI.create("https://www.googleapis.com/oauth2/v3/certs");
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final HttpClient HTTP = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
    private static final AtomicReference<KeySet> CACHED = new AtomicReference<>(new KeySet(Map.of(), Instant.EPOCH));
    private GoogleIdentityVerifier() {}

    public static Identity verify(String token, String clientId) {
        try {
            if (token == null || token.length() > 16384 || clientId == null || clientId.isBlank()) throw new IllegalArgumentException();
            String[] parts = token.split("\\.");
            if (parts.length != 3) throw new IllegalArgumentException();
            JsonNode header = JSON.readTree(Base64.getUrlDecoder().decode(parts[0]));
            JsonNode claims = JSON.readTree(Base64.getUrlDecoder().decode(parts[1]));
            if (!"RS256".equals(header.path("alg").asText())) throw new IllegalArgumentException();
            String kid = header.path("kid").asText();
            RSAPublicKey key = signingKey(kid);
            Signature signature = Signature.getInstance("SHA256withRSA");
            signature.initVerify(key);
            signature.update((parts[0] + "." + parts[1]).getBytes(java.nio.charset.StandardCharsets.US_ASCII));
            if (!signature.verify(Base64.getUrlDecoder().decode(parts[2]))) throw new IllegalArgumentException();
            String issuer = claims.path("iss").asText();
            if (!(issuer.equals("accounts.google.com") || issuer.equals("https://accounts.google.com"))) throw new IllegalArgumentException();
            JsonNode audience = claims.path("aud");
            boolean matches = audience.isTextual() ? clientId.equals(audience.asText()) : audience.isArray() && contains(audience, clientId);
            if (!matches) throw new IllegalArgumentException();
            if (audience.isArray() && audience.size() > 1 && !claims.hasNonNull("azp")) throw new IllegalArgumentException();
            if (claims.hasNonNull("azp") && !clientId.equals(claims.path("azp").asText())) throw new IllegalArgumentException();
            long now = Instant.now().getEpochSecond();
            if (claims.path("exp").asLong(0) <= now || claims.path("iat").asLong(Long.MAX_VALUE) > now + 60 || (claims.hasNonNull("nbf") && claims.path("nbf").asLong() > now + 60)) throw new IllegalArgumentException();
            JsonNode verified = claims.path("email_verified");
            if (!(verified.asBoolean(false) || "true".equalsIgnoreCase(verified.asText()))) throw new IllegalArgumentException();
            String subject = claims.path("sub").asText();
            String email = claims.path("email").asText().trim().toLowerCase(java.util.Locale.ROOT);
            String name = claims.path("name").asText().trim();
            if (subject.isBlank() || subject.length() > 255 || email.isBlank() || email.length() > 180) throw new IllegalArgumentException();
            if (name.isBlank()) name = email.substring(0, email.indexOf('@') > 0 ? email.indexOf('@') : email.length());
            String hostedDomain=claims.path("hd").asText();
            boolean authoritative=email.endsWith("@gmail.com")||!hostedDomain.isBlank();
            return new Identity(subject, email, name.length() > 120 ? name.substring(0, 120) : name, authoritative);
        } catch (Exception e) {
            throw new AuthenticationException("Google sign-in could not be verified. Please try again.", e);
        }
    }

    private static boolean contains(JsonNode array, String value) { for (JsonNode item : array) if (value.equals(item.asText())) return true; return false; }
    private static RSAPublicKey signingKey(String kid) throws Exception {
        KeySet set = CACHED.get();
        if (!set.expiresAt().isAfter(Instant.now()) || !set.keys().containsKey(kid)) set = refreshKeys(true);
        RSAPublicKey key = set.keys().get(kid);
        if (key == null) throw new IllegalArgumentException("Unknown Google signing key");
        return key;
    }
    private static synchronized KeySet refreshKeys(boolean force) throws Exception {
        KeySet existing = CACHED.get();
        if (!force && existing.expiresAt().isAfter(Instant.now())) return existing;
        HttpRequest request = HttpRequest.newBuilder(KEYS_URI).timeout(Duration.ofSeconds(10)).GET().build();
        HttpResponse<String> response = HTTP.send(request, HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() != 200) throw new IllegalStateException("Google signing keys are unavailable");
        JsonNode jwks = JSON.readTree(response.body());
        Map<String, RSAPublicKey> keys = new ConcurrentHashMap<>();
        for (JsonNode item : jwks.path("keys")) {
            if (!"RSA".equals(item.path("kty").asText()) || !"RS256".equals(item.path("alg").asText("RS256"))) continue;
            BigInteger modulus = new BigInteger(1, Base64.getUrlDecoder().decode(item.path("n").asText()));
            BigInteger exponent = new BigInteger(1, Base64.getUrlDecoder().decode(item.path("e").asText()));
            RSAPublicKey key = (RSAPublicKey) KeyFactory.getInstance("RSA").generatePublic(new RSAPublicKeySpec(modulus, exponent));
            keys.put(item.path("kid").asText(), key);
        }
        if (keys.isEmpty()) throw new IllegalStateException("Google signing keys are empty");
        long maxAge = response.headers().firstValue("Cache-Control").map(GoogleIdentityVerifier::maxAge).orElse(3600L);
        KeySet updated = new KeySet(Map.copyOf(keys), Instant.now().plusSeconds(Math.max(60, Math.min(maxAge, 86400))));
        CACHED.set(updated);
        return updated;
    }
    private static long maxAge(String value) { for (String part : value.split(",")) { String p=part.trim(); if (p.startsWith("max-age=")) try { return Long.parseLong(p.substring(8)); } catch (NumberFormatException ignored) {} } return 3600L; }
    private record KeySet(Map<String, RSAPublicKey> keys, Instant expiresAt) {}
}
