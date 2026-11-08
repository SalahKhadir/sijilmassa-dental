CREATE TABLE application_user (
    id uuid CONSTRAINT application_user_pk PRIMARY KEY,
    username varchar(64) NOT NULL CONSTRAINT application_user_username_unique UNIQUE,
    password_hash varchar(60) NOT NULL,
    role varchar(16) NOT NULL,
    active boolean NOT NULL DEFAULT true,
    session_version bigint NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL,
    last_login_at timestamptz,
    CONSTRAINT application_user_username_format CHECK (username ~ '^[a-z0-9][a-z0-9._-]{2,63}$'),
    CONSTRAINT application_user_password_format CHECK (password_hash ~ '^\$2[aby]\$12\$[./A-Za-z0-9]{53}$'),
    CONSTRAINT application_user_role CHECK (role IN ('DENTIST', 'RECEPTIONIST')),
    CONSTRAINT application_user_session_version CHECK (session_version >= 0),
    CONSTRAINT application_user_timestamps CHECK (updated_at >= created_at AND (last_login_at IS NULL OR last_login_at >= created_at))
);

CREATE TABLE security_audit_event (
    id uuid CONSTRAINT security_audit_event_pk PRIMARY KEY,
    occurred_at timestamptz NOT NULL,
    event_type varchar(32) NOT NULL,
    actor_user_id uuid REFERENCES application_user(id) ON DELETE RESTRICT,
    subject_user_id uuid REFERENCES application_user(id) ON DELETE RESTRICT,
    CONSTRAINT security_audit_event_type CHECK (event_type IN (
        'ACCOUNTS_BOOTSTRAPPED', 'LOGIN_SUCCEEDED', 'LOGIN_FAILED', 'LOGOUT',
        'ACCOUNT_DISABLED', 'LOGIN_THROTTLED', 'SESSION_REVOKED'
    ))
);
CREATE INDEX security_audit_event_time_idx ON security_audit_event (occurred_at);
CREATE INDEX security_audit_event_actor_time_idx ON security_audit_event (actor_user_id, occurred_at);
CREATE INDEX security_audit_event_subject_time_idx ON security_audit_event (subject_user_id, occurred_at);
