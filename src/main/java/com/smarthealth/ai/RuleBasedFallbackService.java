package com.smarthealth.ai;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import java.util.Map;

/** Transparent single-reading screening heuristic used when no live model is configured. */
public class RuleBasedFallbackService implements AIService {
    private final ObjectMapper mapper = new ObjectMapper();

    @Override public String getRiskAssessment(String prompt) {
        try {
            JsonNode data = mapper.readTree(prompt);
            int heartRate = data.path("heartRate").asInt(75);
            int systolic = data.path("systolicBP").asInt(120);
            int diastolic = data.path("diastolicBP").asInt(75);
            int spo2 = data.path("spo2").asInt(98);
            int score = 0;
            if (heartRate < 50 || heartRate > 120) score += 20;
            if (systolic > 180 || diastolic > 120) score += 60;
            else if (systolic >= 140 || diastolic >= 90) score += 30;
            else if (systolic >= 130 || diastolic >= 80) score += 15;
            if (spo2 <= 88) score += 60;
            else if (spo2 <= 92) score += 35;
            else if (spo2 < 95) score += 15;
            score = Math.min(100, score);
            String level = score >= 60 ? "HIGH" : score >= 25 ? "MEDIUM" : "LOW";
            String guidance = switch (level) {
                case "HIGH" -> "One or more vital-sign thresholds need prompt verification and clinical review. If severe symptoms occur, seek emergency care.";
                case "MEDIUM" -> "This reading has a signal worth repeating at rest and discussing with a health professional if it persists.";
                default -> "No high-priority threshold was triggered by this single reading. Continue tracking; this does not rule out a health condition.";
            };
            return mapper.writeValueAsString(Map.of("riskLevel", level, "riskScore", score,
                "guidance", guidance,
                "preventionTips", List.of("Repeat measurements after resting and check that the device is positioned correctly.",
                    "Share repeated readings and any symptoms with your health professional.")));
        } catch (Exception e) {
            return "{\"riskLevel\":\"MEDIUM\",\"riskScore\":40,\"guidance\":\"The reading could not be assessed. Repeat it and contact a health professional if concerned.\",\"preventionTips\":[\"Repeat the measurement\"]}";
        }
    }
}
