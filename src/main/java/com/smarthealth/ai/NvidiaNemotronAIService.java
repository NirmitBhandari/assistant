package com.smarthealth.ai;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.smarthealth.exception.AIServiceException;
import java.net.URI;
import java.net.http.*;
import java.time.Duration;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/** NVIDIA NIM chat completions client for Nemotron models. */
public class NvidiaNemotronAIService implements AIService {
    private static final Logger log = LoggerFactory.getLogger(NvidiaNemotronAIService.class);
    private final String key, url, model;
    private final HttpClient client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(15)).build();
    private final ObjectMapper mapper = new ObjectMapper();

    public NvidiaNemotronAIService(String key, String url, String model) { this.key=key; this.url=url; this.model=model; }

    @Override public String getRiskAssessment(String prompt) {
        ObjectNode body = baseRequest();
        body.putArray("messages").addObject().put("role","user").put("content",prompt);
        return send(body);
    }

    @Override public String answerQuestion(String systemPrompt, String userPrompt) {
        ObjectNode body = baseRequest();
        // Build the two-message conversation explicitly to keep trusted safety rules separate.
        var messages = body.putArray("messages");
        messages.addObject().put("role","system").put("content",systemPrompt);
        messages.addObject().put("role","user").put("content",userPrompt);
        return send(body);
    }

    private ObjectNode baseRequest() {
        ObjectNode body = mapper.createObjectNode();
        body.put("model", model);
        body.put("max_tokens", 700);
        body.put("temperature", 0.2);
        body.put("top_p", 0.95);
        body.put("stream", false);
        body.put("reasoning_effort", "none");
        return body;
    }

    private String send(ObjectNode body) {
        for (int attempt = 0; attempt < 2; attempt++) {
            try {
                HttpRequest req = HttpRequest.newBuilder(URI.create(url)).timeout(Duration.ofSeconds(90))
                    .header("Authorization", "Bearer " + key)
                    .header("Content-Type", "application/json")
                    .header("Accept", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(body))).build();
                HttpResponse<String> res = client.send(req, HttpResponse.BodyHandlers.ofString());
                if (res.statusCode() < 200 || res.statusCode() >= 300) {
                    String detail = res.body() == null ? "" : res.body().replaceAll("[\\r\\n\\t]+", " ");
                    if (detail.length() > 500) detail = detail.substring(0, 500);
                    log.warn("NVIDIA API returned HTTP {}: {}", res.statusCode(), detail);
                    throw new AIServiceException(userFacingStatus(res.statusCode()));
                }
                JsonNode content = mapper.readTree(res.body()).path("choices").path(0).path("message").path("content");
                if (!content.isTextual() || content.asText().isBlank()) {
                    throw new IllegalStateException("NVIDIA API returned empty content");
                }
                return content.asText();
            } catch (AIServiceException e) {
                throw e;
            } catch (Exception e) {
                if (attempt == 1) {
                    log.warn("NVIDIA AI request failed: {}", e.toString());
                    String message = e instanceof java.net.http.HttpTimeoutException
                        ? "NVIDIA AI request timed out. Please retry in a moment."
                        : "NVIDIA AI request unavailable (" + e.getClass().getSimpleName() + "). Check the server logs for details.";
                    throw new AIServiceException(message, e);
                }
                try {
                    Thread.sleep(350);
                } catch (InterruptedException interrupted) {
                    Thread.currentThread().interrupt();
                    throw new AIServiceException("NVIDIA request interrupted", interrupted);
                }
            }
        }
        throw new AIServiceException("NVIDIA AI request unavailable");
    }

    private String userFacingStatus(int status) {
        return switch (status) {
            case 401 -> "NVIDIA rejected the API key. Check NVIDIA_API_KEY in the deployment environment.";
            case 403 -> "This NVIDIA API key does not have access to the configured model.";
            case 404 -> "NVIDIA could not find the configured model or API endpoint.";
            case 429 -> "NVIDIA rate limit or quota reached. Please wait and try again.";
            default -> status >= 500
                ? "NVIDIA AI is temporarily unavailable (HTTP " + status + "). Please try again shortly."
                : "NVIDIA AI request failed (HTTP " + status + "). Check the deployment logs.";
        };
    }
}
