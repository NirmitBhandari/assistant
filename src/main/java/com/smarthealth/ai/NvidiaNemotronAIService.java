package com.smarthealth.ai;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.smarthealth.exception.AIServiceException;
import java.net.URI;
import java.net.http.*;
import java.time.Duration;

/** NVIDIA NIM chat completions client for Nemotron models. */
public class NvidiaNemotronAIService implements AIService {
    private final String key, url, model;
    private final HttpClient client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(8)).build();
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
        ObjectNode body=mapper.createObjectNode();
        body.put("model",model);body.put("max_tokens",700);body.put("temperature",0.2);body.put("stream",false);body.put("reasoning_effort","none");
        return body;
    }

    private String send(ObjectNode body) {
        for(int attempt=0;attempt<2;attempt++)try {
            HttpRequest req=HttpRequest.newBuilder(URI.create(url)).timeout(Duration.ofSeconds(35))
                .header("Authorization","Bearer "+key).header("Content-Type","application/json").header("Accept","application/json")
                .POST(HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(body))).build();
            HttpResponse<String> res=client.send(req,HttpResponse.BodyHandlers.ofString());
            if(res.statusCode()<200||res.statusCode()>=300)throw new IllegalStateException("NVIDIA API returned HTTP "+res.statusCode());
            JsonNode content=mapper.readTree(res.body()).path("choices").path(0).path("message").path("content");
            if(!content.isTextual()||content.asText().isBlank())throw new IllegalStateException("NVIDIA API returned empty content");
            return content.asText();
        } catch(Exception e) {
            if(attempt==1)throw new AIServiceException("NVIDIA AI request unavailable",e);
            try{Thread.sleep(350);}catch(InterruptedException x){Thread.currentThread().interrupt();throw new AIServiceException("NVIDIA request interrupted",x);}
        }
        throw new AIServiceException("NVIDIA AI request unavailable");
    }
}
