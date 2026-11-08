package ma.sijilmassa.security;

/** Apply to service operations in addition to an explicit HTTP allowlist. */
public final class RolePolicies {
    public static final String CLINICAL = "hasRole('DENTIST')";
    public static final String ADMINISTRATIVE = "hasAnyRole('DENTIST', 'RECEPTIONIST')";
    private RolePolicies() { }
}
