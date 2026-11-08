-- Test classpath only. Never packaged in the application.
CREATE TABLE validation_probe (
    id bigint CONSTRAINT validation_probe_pk PRIMARY KEY,
    marker varchar(255) NOT NULL
);
