package com.smarthealth.service;

import com.smarthealth.dao.ConnectionManager;
import com.smarthealth.model.HealthResult;
import com.smarthealth.model.SensorData;
import com.smarthealth.web.EventBus;
import java.sql.*;
import java.time.LocalDateTime;
import java.util.concurrent.*;
import java.util.concurrent.ThreadLocalRandom;

/** Demo-only source of sensor readings and fresh educational assessments. */
public class SensorSimulator implements AutoCloseable {
    private final ScheduledExecutorService executor = Executors.newSingleThreadScheduledExecutor();
    private final ConnectionManager db;
    private final EventBus events;
    private final HeartDiseaseDetector detector;

    public SensorSimulator(ConnectionManager db, EventBus events, HeartDiseaseDetector detector) {
        this.db = db; this.events = events; this.detector = detector;
    }

    public void start() { executor.scheduleAtFixedRate(this::emit, 5, 15, TimeUnit.SECONDS); }

    private void emit() {
        SensorData reading = new SensorData(0, 1,
            65 + ThreadLocalRandom.current().nextInt(30),
            110 + ThreadLocalRandom.current().nextInt(25), 75,
            96 + ThreadLocalRandom.current().nextInt(5), LocalDateTime.now(), "Demo sensor");
        try (Connection c = db.getConnection(); PreparedStatement insert = c.prepareStatement(
            "INSERT INTO sensor_data(patient_id,heart_rate,systolic_bp,diastolic_bp,spo2,recorded_at,source) VALUES(?,?,?,?,?,?,?)",
            Statement.RETURN_GENERATED_KEYS)) {
            insert.setLong(1, reading.getPatientId()); insert.setInt(2, reading.getHeartRate());
            insert.setInt(3, reading.getSystolicBP()); insert.setInt(4, reading.getDiastolicBP());
            insert.setInt(5, reading.getSpo2()); insert.setTimestamp(6, Timestamp.valueOf(reading.getTimestamp()));
            insert.setString(7, reading.getSource()); insert.executeUpdate();
            try (ResultSet keys = insert.getGeneratedKeys()) { if (keys.next()) reading.setId(keys.getLong(1)); }
            HealthResult result = detector.analyze(reading);
            try (PreparedStatement save = c.prepareStatement(
                "INSERT INTO health_results(patient_id,risk_level,risk_score,guidance,prevention_tips,generated_at) VALUES(?,?,?,?,?,?)")) {
                save.setLong(1, reading.getPatientId()); save.setString(2, result.getRiskLevel().name());
                save.setInt(3, result.getRiskScore()); save.setString(4, result.getGuidance());
                save.setString(5, String.join("|", result.getPreventionTips()));
                save.setTimestamp(6, Timestamp.valueOf(result.getGeneratedAt())); save.executeUpdate();
            }
            events.publish("reading", reading);
            events.publish("risk", result);
        } catch (SQLException e) { /* the next sensor tick retries transient database errors */ }
    }

    @Override public void close() { executor.shutdownNow(); }
}
