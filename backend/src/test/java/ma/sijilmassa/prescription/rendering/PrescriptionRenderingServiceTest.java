package ma.sijilmassa.prescription.rendering;

import java.util.List;
import ma.sijilmassa.prescription.*;
import ma.sijilmassa.security.*;
import org.junit.jupiter.api.*;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class PrescriptionRenderingServiceTest {
    PrescriptionService prescriptions = mock(PrescriptionService.class);
    LocalPrescriptionRenderer renderer = mock(LocalPrescriptionRenderer.class);
    UserAccountRepository users = mock(UserAccountRepository.class);
    PrescriptionRenderingService service = new PrescriptionRenderingService(prescriptions, renderer, users);
    UserAccount actor = new UserAccount("synthetic.dentist", "unused-test-hash", Role.DENTIST, java.time.Instant.now());
    PrescriptionDtos.Details initial = RenderingFixtures.details();
    @BeforeEach void context() {
        SecurityContextHolder.getContext().setAuthentication(UsernamePasswordAuthenticationToken.authenticated(actor.principal(), null,
                List.of(new SimpleGrantedAuthority("ROLE_DENTIST"))));
        when(users.findById(actor.getId())).thenReturn(java.util.Optional.of(actor));
        when(prescriptions.get(initial.patientId(), initial.id())).thenReturn(initial);
        when(renderer.render(any())).thenReturn(new RenderedPdf(new byte[]{1}, "hash", "renderer", "template", "font"));
    }
    @AfterEach void clear() { SecurityContextHolder.clearContext(); }
    @Test void mappingUsesServerIdentityAndReadsAgainWithoutCallingAnyWrite() {
        service.renderDraft(initial.patientId(), initial.id(), 0, 0);
        verify(renderer).render(argThat(q -> q.record().patientId().equals(initial.patientId()) && q.patient().displayName().equals(initial.patient().displayName()) && q.mode() == RenderingRequest.Mode.DRAFT));
        verify(prescriptions, times(2)).get(initial.patientId(), initial.id()); verifyNoMoreInteractions(prescriptions);
    }
    @Test void stalePrescriptionOrPatientVersionNeverStartsTheWorker() {
        for (long[] pair : new long[][]{{1, 0}, {0, 1}})
            assertThatThrownBy(() -> service.renderDraft(initial.patientId(), initial.id(), pair[0], pair[1])).isInstanceOf(PrescriptionFailure.class);
        verifyNoInteractions(renderer);
    }
    @Test void concurrentChangeDiscardsAnAlreadyRenderedResult() {
        var changed = new PrescriptionDtos.Details(initial.id(), initial.patientId(), 1, initial.status(), initial.content(), initial.patient(), initial.createdAt(), initial.updatedAt(), null, null, null);
        when(prescriptions.get(initial.patientId(), initial.id())).thenReturn(initial, changed);
        assertThatThrownBy(() -> service.renderDraft(initial.patientId(), initial.id(), 0, 0)).isInstanceOfSatisfying(PrescriptionFailure.class,
                e -> assertThat(e.reason()).isEqualTo(PrescriptionFailure.Reason.VERSION_CONFLICT));
        verify(renderer).render(any());
    }
    @Test void accountRevokedDuringRenderingDiscardsTheResult() {
        when(users.findById(actor.getId())).thenReturn(java.util.Optional.of(actor), java.util.Optional.empty());
        assertThatThrownBy(() -> service.renderDraft(initial.patientId(), initial.id(), 0, 0)).isInstanceOf(AccessDeniedException.class);
    }
    @Test void unauthenticatedInvocationNeverReadsThePrescription() {
        SecurityContextHolder.clearContext();
        assertThatThrownBy(() -> service.renderDraft(initial.patientId(), initial.id(), 0, 0)).isInstanceOf(AccessDeniedException.class);
        verifyNoInteractions(prescriptions, renderer);
    }
    @Test void renderingFailureIsNotRetriedAndCannotCallAWrite() {
        when(renderer.render(any())).thenThrow(new RenderingFailure(RenderingFailure.Code.TIMEOUT));
        assertThatThrownBy(() -> service.renderDraft(initial.patientId(), initial.id(), 0, 0)).isInstanceOf(RenderingFailure.class);
        verify(renderer, times(1)).render(any()); verify(prescriptions).get(initial.patientId(), initial.id()); verifyNoMoreInteractions(prescriptions);
    }
}
