package com.smarthealth.ai;

/** Offline demo assessor that bases its response on the submitted vital signs. */
public class MockAIService implements AIService {
    private final RuleBasedFallbackService rules = new RuleBasedFallbackService();

    @Override public String getRiskAssessment(String prompt) {
        String vitals = prompt;
        int marker = prompt.lastIndexOf("Data:");
        if (marker >= 0) vitals = prompt.substring(marker + "Data:".length()).trim();
        return rules.getRiskAssessment(vitals);
    }
}
