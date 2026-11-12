package ma.sijilmassa.insurance;

import java.util.Map;

import static java.util.Map.entry;
import static ma.sijilmassa.insurance.InsuranceModels.DocumentType;
import static ma.sijilmassa.insurance.InsurancePdfFailure.Code.INSURANCE_PDF_INTEGRITY;

/** Measured FDI centres from the separately calibrated CNSS and CNOPS scans. */
final class InsurancePdfTeeth {
    record Point(float x, float y) { }

    private InsurancePdfTeeth() { }

    static Point position(DocumentType type, String tooth) {
        Point point = (type == DocumentType.CNSS_DENTAIRE ? CNSS : CNOPS).get(tooth);
        if (point == null) throw new InsurancePdfFailure(INSURANCE_PDF_INTEGRITY);
        return point;
    }

    private static final Map<String, Point> CNSS = Map.ofEntries(
            entry("11", new Point(772.788f, 351.572f)),
            entry("12", new Point(763.760f, 354.668f)),
            entry("13", new Point(756.280f, 361.374f)),
            entry("14", new Point(751.895f, 371.176f)),
            entry("15", new Point(745.189f, 382.783f)),
            entry("16", new Point(741.835f, 397.228f)),
            entry("17", new Point(738.482f, 411.930f)),
            entry("18", new Point(735.645f, 428.438f)),
            entry("21", new Point(782.590f, 351.572f)),
            entry("22", new Point(792.650f, 355.183f)),
            entry("23", new Point(799.872f, 361.632f)),
            entry("24", new Point(803.483f, 371.692f)),
            entry("25", new Point(809.674f, 383.815f)),
            entry("26", new Point(813.027f, 397.743f)),
            entry("27", new Point(816.896f, 412.446f)),
            entry("28", new Point(819.217f, 428.696f)),
            entry("31", new Point(781.816f, 529.035f)),
            entry("32", new Point(789.554f, 526.456f)),
            entry("33", new Point(796.003f, 521.039f)),
            entry("34", new Point(801.935f, 513.559f)),
            entry("35", new Point(806.578f, 503.241f)),
            entry("36", new Point(812.253f, 491.376f)),
            entry("37", new Point(816.380f, 476.157f)),
            entry("38", new Point(820.249f, 458.101f)),
            entry("41", new Point(773.046f, 528.777f)),
            entry("42", new Point(764.018f, 526.198f)),
            entry("43", new Point(757.054f, 521.297f)),
            entry("44", new Point(751.379f, 513.816f)),
            entry("45", new Point(745.962f, 504.015f)),
            entry("46", new Point(740.804f, 491.634f)),
            entry("47", new Point(737.450f, 476.157f)),
            entry("48", new Point(734.097f, 458.359f)),
            entry("51", new Point(774.852f, 375.045f)),
            entry("52", new Point(769.951f, 377.366f)),
            entry("53", new Point(766.082f, 380.977f)),
            entry("54", new Point(762.471f, 386.136f)),
            entry("55", new Point(759.633f, 393.616f)),
            entry("61", new Point(781.300f, 375.045f)),
            entry("62", new Point(785.427f, 377.366f)),
            entry("63", new Point(790.070f, 380.977f)),
            entry("64", new Point(793.165f, 386.136f)),
            entry("65", new Point(796.519f, 393.616f)),
            entry("71", new Point(781.300f, 508.916f)),
            entry("72", new Point(785.943f, 507.110f)),
            entry("73", new Point(790.328f, 503.499f)),
            entry("74", new Point(792.908f, 498.082f)),
            entry("75", new Point(796.519f, 491.376f)),
            entry("81", new Point(774.078f, 508.658f)),
            entry("82", new Point(769.177f, 506.852f)),
            entry("83", new Point(765.050f, 503.241f)),
            entry("84", new Point(761.439f, 498.082f)),
            entry("85", new Point(757.828f, 491.892f)));

    private static final Map<String, Point> CNOPS = Map.ofEntries(
            entry("11", new Point(595.783f, 305.586f)),
            entry("12", new Point(586.589f, 308.584f)),
            entry("13", new Point(579.194f, 314.180f)),
            entry("14", new Point(574.398f, 323.773f)),
            entry("15", new Point(567.802f, 334.766f)),
            entry("16", new Point(564.804f, 347.157f)),
            entry("17", new Point(560.407f, 360.747f)),
            entry("18", new Point(558.209f, 375.337f)),
            entry("21", new Point(606.175f, 305.586f)),
            entry("22", new Point(616.568f, 308.584f)),
            entry("23", new Point(623.963f, 314.380f)),
            entry("24", new Point(627.760f, 323.573f)),
            entry("25", new Point(634.556f, 334.366f)),
            entry("26", new Point(637.953f, 347.157f)),
            entry("27", new Point(641.950f, 360.547f)),
            entry("28", new Point(644.548f, 375.337f)),
            entry("31", new Point(606.175f, 467.073f)),
            entry("32", new Point(614.370f, 465.474f)),
            entry("33", new Point(622.564f, 461.277f)),
            entry("34", new Point(626.961f, 452.483f)),
            entry("35", new Point(632.357f, 443.090f)),
            entry("36", new Point(637.553f, 432.497f)),
            entry("37", new Point(640.751f, 417.707f)),
            entry("38", new Point(644.948f, 402.118f)),
            entry("41", new Point(595.983f, 467.273f)),
            entry("42", new Point(586.589f, 465.074f)),
            entry("43", new Point(578.595f, 461.277f)),
            entry("44", new Point(573.198f, 452.083f)),
            entry("45", new Point(567.602f, 442.890f)),
            entry("46", new Point(562.406f, 432.497f)),
            entry("47", new Point(559.008f, 417.707f)),
            entry("48", new Point(554.611f, 402.118f)),
            entry("51", new Point(598.381f, 327.171f)),
            entry("52", new Point(592.785f, 328.970f)),
            entry("53", new Point(588.388f, 332.367f)),
            entry("54", new Point(585.990f, 337.564f)),
            entry("55", new Point(582.392f, 343.959f)),
            entry("61", new Point(603.777f, 327.171f)),
            entry("62", new Point(609.373f, 328.970f)),
            entry("63", new Point(613.970f, 332.767f)),
            entry("64", new Point(616.768f, 337.763f)),
            entry("65", new Point(620.166f, 343.959f)),
            entry("71", new Point(603.977f, 447.886f)),
            entry("72", new Point(609.573f, 446.487f)),
            entry("73", new Point(614.170f, 443.689f)),
            entry("74", new Point(617.567f, 439.692f)),
            entry("75", new Point(620.565f, 432.897f)),
            entry("81", new Point(598.181f, 447.886f)),
            entry("82", new Point(592.585f, 446.487f)),
            entry("83", new Point(587.588f, 443.889f)),
            entry("84", new Point(584.191f, 439.692f)),
            entry("85", new Point(581.393f, 432.897f)));

}
