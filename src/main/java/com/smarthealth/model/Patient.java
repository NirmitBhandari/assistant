package com.smarthealth.model;
import java.util.Objects;
/** A registered health assistant user. */
public class Patient {
 private long id; private String name; private int age; private String gender; private String medicalHistory; private String email;
 public Patient(){} public Patient(long id,String name,int age,String gender,String medicalHistory,String email){this.id=id;setName(name);setAge(age);this.gender=gender;this.medicalHistory=medicalHistory;this.email=email;}
 public long getId(){return id;} public void setId(long v){id=v;} public String getName(){return name;} public void setName(String v){if(v==null||v.isBlank())throw new IllegalArgumentException("Name is required");name=v;}
 public int getAge(){return age;} public void setAge(int v){if(v<1||v>120)throw new IllegalArgumentException("Age must be 1-120");age=v;} public String getGender(){return gender;} public void setGender(String v){gender=v;} public String getMedicalHistory(){return medicalHistory;} public void setMedicalHistory(String v){medicalHistory=v;} public String getEmail(){return email;} public void setEmail(String v){email=v;}
 @Override public String toString(){return "Patient{id="+id+", name='"+name+"', age="+age+"}";} @Override public boolean equals(Object o){return o instanceof Patient p&&id==p.id;} @Override public int hashCode(){return Objects.hash(id);}
}
