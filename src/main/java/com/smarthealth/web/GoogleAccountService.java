package com.smarthealth.web;

import com.smarthealth.dao.ConnectionManager;
import com.smarthealth.exception.AuthenticationException;
import com.smarthealth.util.PasswordUtil;
import java.security.SecureRandom;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.Base64;
import java.util.Optional;

/** Safely links verified Google identities or creates a minimum health profile. */
public final class GoogleAccountService {
    public record Account(long patientId, String name) {}
    private static final SecureRandom RANDOM = new SecureRandom();
    private GoogleAccountService() {}

    public static Optional<Account> signInOrCreate(ConnectionManager db, GoogleIdentityVerifier.Identity identity, Integer age) {
        try (Connection c = db.getConnection()) {
            c.setAutoCommit(false);
            try {
                try (PreparedStatement p = c.prepareStatement("SELECT u.patient_id,p.name FROM users u JOIN patients p ON p.id=u.patient_id WHERE u.google_sub=?")) {
                    p.setString(1, identity.subject());
                    try (ResultSet r = p.executeQuery()) { if (r.next()) { Account account=new Account(r.getLong(1),r.getString(2));c.commit();return Optional.of(account); } }
                }
                try (PreparedStatement p = c.prepareStatement("SELECT u.id,u.patient_id,u.google_sub,p.name FROM users u JOIN patients p ON p.id=u.patient_id WHERE LOWER(p.email)=?")) {
                    p.setString(1, identity.email());
                    try (ResultSet r = p.executeQuery()) {
                        if (r.next()) {
                            String existing=r.getString("google_sub");
                            if (existing != null && !existing.equals(identity.subject())) throw new AuthenticationException("That account is already linked to a different Google identity.");
                            if(existing==null){
                                if(!identity.emailAuthoritative())throw new AuthenticationException("This email matches an existing account and cannot be linked automatically. Use the existing sign-in method.");
                                try (PreparedStatement link=c.prepareStatement("UPDATE users SET google_sub=? WHERE id=? AND google_sub IS NULL")) { link.setString(1,identity.subject());link.setLong(2,r.getLong("id"));if(link.executeUpdate()!=1)throw new AuthenticationException("That account changed during sign-in. Please retry."); }
                            }
                            Account account=new Account(r.getLong("patient_id"),r.getString("name"));c.commit();return Optional.of(account);
                        }
                    }
                }
                if (age == null) { c.rollback(); return Optional.empty(); }
                if (age < 1 || age > 120) throw new IllegalArgumentException("Enter an age between 1 and 120.");
                long patientId;
                try (Statement s=c.createStatement();ResultSet r=s.executeQuery("SELECT NEXT VALUE FOR patient_id_seq")) { r.next(); patientId=r.getLong(1); }
                try (PreparedStatement p=c.prepareStatement("INSERT INTO patients(id,name,age,gender,medical_history,email) VALUES(?,?,?,'Not specified','Not provided',?)")) {
                    p.setLong(1,patientId);p.setString(2,identity.name());p.setInt(3,age);p.setString(4,identity.email());p.executeUpdate();
                }
                String salt=PasswordUtil.salt();byte[] randomPassword=new byte[48];RANDOM.nextBytes(randomPassword);String password=Base64.getEncoder().encodeToString(randomPassword);String username="google_"+java.util.UUID.nameUUIDFromBytes(identity.subject().getBytes(java.nio.charset.StandardCharsets.UTF_8));
                try (PreparedStatement p=c.prepareStatement("INSERT INTO users(patient_id,username,password_hash,salt,google_sub) VALUES(?,?,?,?,?)")) {
                    p.setLong(1,patientId);p.setString(2,username);p.setString(3,PasswordUtil.hash(password,salt));p.setString(4,salt);p.setString(5,identity.subject());p.executeUpdate();
                }
                c.commit();return Optional.of(new Account(patientId,identity.name()));
            } catch (RuntimeException | java.sql.SQLException e) { c.rollback();throw e; }
        } catch (AuthenticationException | IllegalArgumentException e) { throw e; }
        catch (Exception e) { throw new IllegalStateException("Google account could not be created",e); }
    }
}
