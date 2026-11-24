package com.smarthealth.service;

import com.smarthealth.dao.ConnectionManager;
import com.smarthealth.web.EventBus;
import java.sql.*;
import java.time.LocalDateTime;
import java.util.Map;
import java.util.concurrent.*;

/** Scans due reminders and sends browser events, repeating daily/weekly schedules. */
public class ReminderScheduler implements AutoCloseable {
    private final ScheduledExecutorService timer = Executors.newSingleThreadScheduledExecutor();
    private final ExecutorService workers = Executors.newFixedThreadPool(2);
    private final ConnectionManager db;
    private final EventBus events;

    public ReminderScheduler(ConnectionManager db, EventBus events) { this.db = db; this.events = events; }
    public void start() { timer.scheduleAtFixedRate(this::scan, 2, 5, TimeUnit.SECONDS); }

    public void scan() {
        String sql = "SELECT r.id,m.name,r.reminder_time,r.schedule FROM reminders r JOIN medicines m ON m.id=r.medicine_id WHERE r.status='PENDING' AND r.reminder_time<=?";
        try (Connection c = db.getConnection(); PreparedStatement p = c.prepareStatement(sql)) {
            p.setTimestamp(1, Timestamp.valueOf(LocalDateTime.now()));
            try (ResultSet rs = p.executeQuery()) {
                while (rs.next()) {
                    long id = rs.getLong(1); String name = rs.getString(2);
                    LocalDateTime at = rs.getTimestamp(3).toLocalDateTime(); String frequency = rs.getString(4);
                    workers.submit(() -> dispatch(id, name, at, frequency));
                }
            }
        } catch (SQLException e) { /* next scheduled scan retries transient database errors */ }
    }

    private void dispatch(long id, String medicine, LocalDateTime at, String frequency) {
        try (Connection c = db.getConnection()) {
            c.setAutoCommit(false);
            try (PreparedStatement update = c.prepareStatement("UPDATE reminders SET status='SENT' WHERE id=? AND status='PENDING'")) {
                update.setLong(1, id);
                if (update.executeUpdate() == 0) { c.rollback(); return; }
            }
            int days = "Daily".equalsIgnoreCase(frequency) ? 1 : "Weekly".equalsIgnoreCase(frequency) ? 7 : 0;
            if (days > 0) try (PreparedStatement next = c.prepareStatement("INSERT INTO reminders(medicine_id,reminder_time,schedule,status) SELECT medicine_id,?,?, 'PENDING' FROM reminders WHERE id=?")) {
                next.setTimestamp(1, Timestamp.valueOf(at.plusDays(days))); next.setString(2, frequency); next.setLong(3, id); next.executeUpdate();
            }
            c.commit();
            events.publish("reminder", Map.of("id", id, "name", medicine, "status", "SENT", "frequency", frequency));
        } catch (SQLException e) { /* leave errors to the next scan/operational log */ }
    }

    @Override public void close() { timer.shutdownNow(); workers.shutdown(); }
}
