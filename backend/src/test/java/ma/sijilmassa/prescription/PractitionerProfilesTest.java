package ma.sijilmassa.prescription;

import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import tools.jackson.databind.json.JsonMapper;
import static org.assertj.core.api.Assertions.*;

class PractitionerProfilesTest {
    @TempDir Path temp;
    final JsonMapper json=JsonMapper.builder().findAndAddModules().build();
    final UUID actor=UUID.randomUUID();
    PractitionerProfiles.Profile profile(UUID id,boolean approved,String template) {
        return new PractitionerProfiles.Profile(1,"synthetic-profile","revision-1",id,approved,template,
                "Texte du modèle","نص النموذج","Titre du modèle","لقب النموذج","Diplôme du modèle","شهادة النموذج",
                "Adresse du modèle","عنوان النموذج",List.of("Téléphone du modèle"),null);
    }
    PractitionerProfiles.Settings config(byte[] bytes) throws Exception {
        var file=temp.resolve("profile.json");Files.write(file,bytes);var settings=new PractitionerProfiles.Settings();settings.setFile(file);settings.setSha256(PractitionerProfiles.digest(bytes));return settings;
    }
    void rejects(PractitionerProfiles value) {
        assertThatThrownBy(()->value.require(actor)).isInstanceOfSatisfying(PrescriptionFailure.class,e->{
            assertThat(e.reason()).isEqualTo(PrescriptionFailure.Reason.PRACTITIONER_UNAVAILABLE);assertThat(e.getCause()).isNull();assertThat(e.getMessage()).doesNotContain("profile.json","Texte");});
    }
    @Test void approvedPinnedProfileIsReadOnceAndBoundToAuthenticatedDentist() throws Exception {
        var expected=profile(actor,true,ma.sijilmassa.prescription.rendering.LocalPrescriptionRenderer.TEMPLATE);
        var settings=config(json.writeValueAsBytes(expected));var value=new PractitionerProfiles(settings,json);
        assertThat(value.require(actor)).isEqualTo(expected);Files.writeString(settings.getFile(),"{}");assertThat(value.require(actor)).isEqualTo(expected);
        assertThatThrownBy(()->value.require(UUID.randomUUID())).isInstanceOf(PrescriptionFailure.class);
    }
    @Test void missingTamperedUnapprovedWrongTemplateAndMalformedProfilesFailClosed() throws Exception {
        rejects(new PractitionerProfiles(new PractitionerProfiles.Settings(),json));
        for(var p:List.of(profile(actor,false,ma.sijilmassa.prescription.rendering.LocalPrescriptionRenderer.TEMPLATE),profile(actor,true,"0".repeat(64))))
            rejects(new PractitionerProfiles(config(json.writeValueAsBytes(p)),json));
        for(String payload:List.of("{}","null","{broken}"," ".repeat(16385))) rejects(new PractitionerProfiles(config(payload.getBytes(java.nio.charset.StandardCharsets.UTF_8)),json));
        var settings=config(json.writeValueAsBytes(profile(actor,true,ma.sijilmassa.prescription.rendering.LocalPrescriptionRenderer.TEMPLATE)));
        settings.setSha256("0".repeat(64));rejects(new PractitionerProfiles(settings,json));
    }
}
