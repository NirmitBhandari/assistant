package com.smarthealth.model;
import org.junit.jupiter.api.Test;import static org.junit.jupiter.api.Assertions.*;import java.time.LocalDateTime;
class SensorDataTest{@Test void validatesVitalRanges(){assertThrows(IllegalArgumentException.class,()->new SensorData(0,1,10,120,80,98,LocalDateTime.now(),"test"));assertThrows(IllegalArgumentException.class,()->new SensorData(0,1,70,120,80,49,LocalDateTime.now(),"test"));assertDoesNotThrow(()->new SensorData(0,1,72,120,80,98,LocalDateTime.now(),"test"));}}
