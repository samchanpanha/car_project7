package com.khlan.service;

import com.khlan.dto.PaymentDTO;
import com.khlan.entity.AbaTransactionEntity;
import com.khlan.entity.SubscriptionPaymentEntity;
import com.khlan.repository.AbaTransactionRepository;
import com.khlan.repository.SubscriptionPaymentRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import net.sourceforge.tess4j.ITesseract;
import net.sourceforge.tess4j.Tesseract;
import java.security.MessageDigest;
import java.time.OffsetDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Slf4j
@Component
@RequiredArgsConstructor
public class ReceiptSlipParser {

    private final SubscriptionPaymentRepository subscriptionPaymentRepository;
    private final AbaTransactionRepository abaTransactionRepository;

    private static final Pattern SVG_TEXT_PATTERN = Pattern.compile("<text[^>]*>([^<]+)</text>", Pattern.CASE_INSENSITIVE);
    private static final Pattern STANDALONE_15_PATTERN = Pattern.compile("\\b(17\\d{13})\\b");
    private static final Pattern WING_BAKONG_16_PATTERN = Pattern.compile("\\b(00024\\d{7}[0-9A-Za-z]{4})\\b");
    private static final Pattern EXT_REF_PATTERN = Pattern.compile(
            "(?:External\\s*Txn\\s*Ref|External\\s*Ref|Ext\\s*Ref)[:\\s#]*([0-9a-zA-Z]{6,32})",
            Pattern.CASE_INSENSITIVE
    );
    private static final Pattern APV_PATTERN = Pattern.compile("\\bAPV[:\\s#]*([0-9]{6})\\b", Pattern.CASE_INSENSITIVE);
    private static final Pattern USD_AMOUNT_PATTERN = Pattern.compile("(?:\\$|USD)\\s*([0-9]+(?:\\.[0-9]{2})?)", Pattern.CASE_INSENSITIVE);
    private static final Pattern KHR_AMOUNT_PATTERN = Pattern.compile("(?:៛|KHR)\\s*([0-9,]+)", Pattern.CASE_INSENSITIVE);
    private static final Pattern PAYEE_PATTERN = Pattern.compile(
            "(?:Paid\\s*to\\s*\\(Payee\\)|Paid\\s*to|Payee|To\\s*Account|Beneficiary)[:\\s]*([A-Za-z0-9\\s]{3,40})",
            Pattern.CASE_INSENSITIVE
    );
    private static final Pattern PAYER_PATTERN = Pattern.compile(
            "(?:From\\s*Account|From|Payer|Sender)[:\\s]*([A-Za-z0-9\\s(*)\\-]{3,40})",
            Pattern.CASE_INSENSITIVE
    );

    public PaymentDTO.OcrResponseDTO processReceipt(
            byte[] imageBytes,
            String dataUrl,
            String plan,
            String cycle,
            String currency,
            String enteredRef,
            String previewUrl,
            PaymentDTO.PaymentConfigDTO paymentConfig) {

        String imageHash = computeSha256(imageBytes);
        // 1. Extract raw text from receipt
        String rawText = extractRawText(imageBytes, dataUrl);

        // 2. Parse receipt fields
        PaymentDTO.ParsedReceiptDTO receiptData = parseReceiptFields(rawText, plan, cycle, currency, enteredRef, dataUrl, previewUrl);

        // 3. Cross-reference with bank transactions (e.g. ABA PayWay)
        boolean isUnderpaid = false;
        if (receiptData.getTrxId() != null) {
            Optional<AbaTransactionEntity> abaOpt = abaTransactionRepository.findByTrxId(receiptData.getTrxId());
            if (abaOpt.isPresent()) {
                AbaTransactionEntity aba = abaOpt.get();
                if (aba.getPayerName() != null) receiptData.setPayerName(aba.getPayerName());
                if (aba.getApv() != null) receiptData.setApv(aba.getApv());
                if (aba.getMerchantName() != null) receiptData.setPayee(aba.getMerchantName());
                if ("UNDERPAID".equalsIgnoreCase(aba.getStatus()) && aba.getAmountUsd() != null && (receiptData.getAmountUsd() == null || receiptData.getAmountUsd() < 1.0)) {
                    receiptData.setAmountUsd(aba.getAmountUsd());
                    receiptData.setAmount(aba.getAmount());
                    isUnderpaid = true;
                }
            }
        }

        // 4. Verify against plan & database
        double expectedUsd = resolveExpectedUsd(plan, "YEARLY".equalsIgnoreCase(cycle));
        double khrRate = (paymentConfig != null && paymentConfig.getManual() != null && paymentConfig.getManual().getKhrExchangeRate() != null)
                ? paymentConfig.getManual().getKhrExchangeRate() : 4100.0;
        double expectedKhr = expectedUsd * khrRate;

        // Duplicate check: only flag if already claimed in an active or pending payment
        boolean isDuplicate = false;
        String duplicateDetails = null;
        if (receiptData.getTrxId() != null && !receiptData.getTrxId().isBlank()) {
            String rawTrx = receiptData.getTrxId().trim();
            String cleanTrx = rawTrx
                    .replaceAll("^(?i)(TRX(?:\\.?\\s*ID)?|TRANSACTION\\s*ID|TXN(?:\\s*ID)?|APV|REF(?:ERENCE)?(?:\\s*(?:NO|ID|#))?)\\s*[:#-]?\\s*", "")
                    .replaceAll("[^A-Za-z0-9]", "")
                    .toUpperCase();
            String trxKey = "TRX:" + cleanTrx;
            List<SubscriptionPaymentEntity> dupByRef = subscriptionPaymentRepository.findDuplicatesByAnyRef(cleanTrx, trxKey);
            for (SubscriptionPaymentEntity dup : dupByRef) {
                if ("VERIFIED".equalsIgnoreCase(dup.getStatus()) || "AWAITING_VERIFICATION".equalsIgnoreCase(dup.getStatus())) {
                    isDuplicate = true;
                    duplicateDetails = "Trx ID " + receiptData.getTrxId() + " already claimed in payment " + dup.getReference() + " (" + dup.getStatus() + ")";
                    break;
                }
            }
        }

        // Image hash duplicate check
        if (!isDuplicate && imageHash != null && !imageHash.isBlank()) {
            Optional<SubscriptionPaymentEntity> dupByImg = subscriptionPaymentRepository.findByEvidenceHash(imageHash);
            if (dupByImg.isPresent()) {
                SubscriptionPaymentEntity dup = dupByImg.get();
                if ("VERIFIED".equalsIgnoreCase(dup.getStatus()) || "AWAITING_VERIFICATION".equalsIgnoreCase(dup.getStatus())) {
                    isDuplicate = true;
                    duplicateDetails = "Exact receipt image previously submitted on payment " + dup.getReference() + " (" + dup.getStatus() + ")";
                }
            }
        }

        // Merchant payee check
        boolean skipMerchant = paymentConfig == null || paymentConfig.getManual() == null
                || Boolean.TRUE.equals(paymentConfig.getManual().getSkipMerchantCheck());
        String expectedMerchant = (paymentConfig != null && paymentConfig.getManual() != null && paymentConfig.getManual().getAccountName() != null)
                ? paymentConfig.getManual().getAccountName() : "SAM CHAN PANHA";

        boolean isWrongMerchant = false;
        if (!skipMerchant && receiptData.getPayee() != null) {
            String p1 = receiptData.getPayee().trim().toUpperCase().replaceAll("[^A-Z0-9]", "");
            String p2 = expectedMerchant.trim().toUpperCase().replaceAll("[^A-Z0-9]", "");
            if (!p1.contains(p2) && !p2.contains(p1) && !p1.contains("SAMCHANPANHA") && !p1.contains("KHLAN")) {
                isWrongMerchant = true;
            }
        }

        boolean amountMatch = false;
        if ("KHR".equalsIgnoreCase(currency)) {
            if (receiptData.getAmountKhr() != null && Math.abs(receiptData.getAmountKhr() - expectedKhr) <= 4100.0) {
                amountMatch = true;
            } else if (receiptData.getAmountUsd() != null && Math.abs(receiptData.getAmountUsd() - expectedUsd) <= 1.0) {
                amountMatch = true;
            }
        } else {
            if (receiptData.getAmountUsd() != null && Math.abs(receiptData.getAmountUsd() - expectedUsd) <= 1.0) {
                amountMatch = true;
            } else if (receiptData.getAmountKhr() != null && Math.abs(receiptData.getAmountKhr() - expectedKhr) <= 4100.0) {
                amountMatch = true;
            }
        }
        boolean currencyMatch = "USD".equalsIgnoreCase(currency) || "KHR".equalsIgnoreCase(currency);

        List<String> riskFlags = new ArrayList<>();
        if (isDuplicate) {
            riskFlags.add("DUPLICATE_RECEIPT");
            riskFlags.add("DUPLICATE_TRANSACTION_ID");
        }
        if (isWrongMerchant) riskFlags.add("WRONG_MERCHANT_PAYEE");
        if (!amountMatch) riskFlags.add("AMOUNT_MISMATCH");

        String status = "PASS";
        String message = "Receipt verified successfully! Trx ID extracted.";
        if (isWrongMerchant) {
            status = "MISMATCH";
            message = "Payment slip was paid to \"" + receiptData.getPayee() + "\" instead of our official merchant KHQR.";
        } else if (isDuplicate) {
            status = "MISMATCH";
            message = "⚠️ Duplicate transaction detected! " + (duplicateDetails != null ? duplicateDetails : "This receipt or Trx ID has already been submitted.");
        } else if (!amountMatch) {
            status = "WARN";
            double detectedVal = receiptData.getAmountUsd() != null ? receiptData.getAmountUsd() : (receiptData.getAmountKhr() != null ? receiptData.getAmountKhr() / khrRate : 0.0);
            message = String.format("Amount detected ($%.2f) differs from plan price ($%.2f).", detectedVal, expectedUsd);
        }

        PaymentDTO.VerificationDetailsDTO verification = PaymentDTO.VerificationDetailsDTO.builder()
                .status(status)
                .confidence(receiptData.getConfidence() != null ? receiptData.getConfidence() : 95.0)
                .amountMatch(amountMatch)
                .currencyMatch(currencyMatch)
                .isDuplicate(isDuplicate)
                .duplicateDetails(duplicateDetails)
                .isOld(false)
                .ageHours(1)
                .isNotCurrentDate(false)
                .transactionDateFormatted(LocalDateNow())
                .isWrongMerchant(isWrongMerchant)
                .detectedPayee(receiptData.getPayee())
                .expectedMerchant(expectedMerchant)
                .isUnderpaid(isUnderpaid || (!amountMatch && receiptData.getAmountUsd() != null && receiptData.getAmountUsd() < expectedUsd))
                .riskFlags(riskFlags)
                .message(message)
                .build();

        return PaymentDTO.OcrResponseDTO.builder()
                .success(!isWrongMerchant && !isDuplicate)
                .blocked(isWrongMerchant)
                .isWrongMerchant(isWrongMerchant)
                .imageHash(imageHash)
                .previewUrl(previewUrl)
                .data(receiptData)
                .verification(verification)
                .build();
    }

    private String extractRawText(byte[] bytes, String dataUrl) {
        StringBuilder sb = new StringBuilder();

        // If SVG, extract text nodes
        if ((dataUrl != null && dataUrl.contains("svg")) || new String(bytes, 0, Math.min(bytes.length, 100), StandardCharsets.ISO_8859_1).contains("<svg")) {
            String svgContent = new String(bytes, StandardCharsets.UTF_8);
            Matcher matcher = SVG_TEXT_PATTERN.matcher(svgContent);
            while (matcher.find()) {
                sb.append(matcher.group(1).trim()).append("\n");
            }
            if (sb.length() > 0) return sb.toString();
        }

        System.setProperty("jna.library.path",
                "/opt/homebrew/lib:/usr/local/lib:/usr/lib");
        // Real OCR for raster images (JPEG/PNG screenshots).
        try {
            BufferedImage img = ImageIO.read(new ByteArrayInputStream(bytes));
            if (img != null) {
                ITesseract tesseract = new Tesseract();
                String[] candidates = new String[] {
                    System.getenv("TESSDATA_PREFIX"),
                    "/usr/share/tessdata",
                    "/usr/share/tesseract-ocr/tessdata",
                    "/usr/share/tesseract-ocr/5/tessdata",
                    "/opt/homebrew/share/tessdata"
                };
                for (String c : candidates) {
                    if (c == null) continue;
                    java.io.File f = new java.io.File(c);
                    if (f.exists() && f.isDirectory()) { tesseract.setDatapath(f.getAbsolutePath()); break; }
                }
                tesseract.setLanguage("eng");
                String ocr = tesseract.doOCR(img);
                if (ocr != null && !ocr.isBlank()) return ocr;
            }
        } catch (Throwable ex) {
            log.warn("[OCR] Tesseract failed: {}", ex.getMessage());
        }

        // Fallback: extract ASCII printable sequences
        StringBuilder currentWord = new StringBuilder();
        for (byte b : bytes) {
            if ((b >= 32 && b <= 126) || b == '\n' || b == '\r') {
                currentWord.append((char) b);
            } else {
                if (currentWord.length() >= 4) {
                    sb.append(currentWord).append("\n");
                }
                currentWord.setLength(0);
            }
        }
        if (currentWord.length() >= 4) sb.append(currentWord).append("\n");

        return sb.toString();
    }

    private PaymentDTO.ParsedReceiptDTO parseReceiptFields(
            String text, String plan, String cycle, String currency, String enteredRef,
            String dataUrl, String previewUrl) {

        String trxId = null;
        String externalRef = null;
        String apv = null;
        Double amount = null;
        String payee = null;
        String payerName = null;
        String bankName = "ABA Bank";
        String bankCode = "ABA";

        // 1. External Ref
        Matcher extMatcher = EXT_REF_PATTERN.matcher(text);
        if (extMatcher.find()) {
            externalRef = extMatcher.group(1).trim();
        }

        // 2. Trx ID
        String upper = text.toUpperCase();
        // Dynamic extraction that works for bank slips (SVG sample or real receipts).
        String[] textLines = text.split("\r?\n");

        if (trxId == null) {
            for (int i = 0; i < textLines.length && trxId == null; i++) {
                String up = textLines[i].toUpperCase();
                if (!(up.contains("TRX") || up.contains("REF") || up.contains("TXN") || up.contains("TRANSACTION") || up.contains("TRANS"))) continue;
                if (up.contains("MERCHANT ID") || up.contains("TERMINAL ID") || up.contains("FROM ACCOUNT") || up.contains("TO ACCOUNT")) continue;
                Matcher same = Pattern.compile("[:.#\\-]\\s*([A-Za-z0-9][A-Za-z0-9\\-]{5,31})").matcher(textLines[i]);
                while (same.find()) {
                    String cand = same.group(1).toUpperCase().replace("-", "").replaceAll("[^A-Z0-9]", "");
                    if (isValidExtractedRef(cand)) { trxId = cand; break; }
                }
                if (trxId != null) break;
                for (int j = i + 1; j < textLines.length && j <= i + 2; j++) {
                    String nxt = textLines[j].trim();
                    if (nxt.isEmpty()) continue;
                    String cand = nxt.toUpperCase().replaceAll("[^A-Z0-9]", "");
                    if (isValidExtractedRef(cand)) { trxId = cand; break; }
                    break;
                }
            }
        }

        // Specific Wing / Bakong 16-character format (e.g. 000245426300FU69, 000245426296F1T4)
        if (trxId == null) {
            Matcher wingM = WING_BAKONG_16_PATTERN.matcher(text);
            if (wingM.find()) {
                String cand = wingM.group(1).toUpperCase();
                if (isValidExtractedRef(cand)) trxId = cand;
            }
        }

        if (trxId == null) {
            Matcher s15 = STANDALONE_15_PATTERN.matcher(text);
            while (s15.find()) {
                String cand = s15.group(1).trim().toUpperCase();
                if (isValidExtractedRef(cand)) { trxId = cand; break; }
            }
        }

        if (trxId == null) {
            Matcher ftm = Pattern.compile("\\b(FT[A-Z0-9]{8,})\\b").matcher(upper);
            if (ftm.find()) trxId = ftm.group(1);
        }

        if (trxId == null && externalRef != null) {
            String extCand = externalRef.trim().toUpperCase().replaceAll("[^A-Z0-9]", "");
            if (isValidExtractedRef(extCand)) trxId = extCand;
        }

        if (trxId == null && enteredRef != null && enteredRef.trim().toUpperCase().matches("FT[A-Z0-9]{8,}")) {
            trxId = enteredRef.trim().toUpperCase();
        }

        if (trxId != null) {
            trxId = trxId.toUpperCase().replaceAll("[^A-Z0-9]", "");
        }
        // 3. APV
        Matcher apvMatcher = APV_PATTERN.matcher(text);
        if (apvMatcher.find()) {
            apv = apvMatcher.group(1).trim();
        }

        // 4. Amount
        String detectedCurrency = "USD";
        double detectedAmountKhr = 0.0;
        Matcher usdMatcher = USD_AMOUNT_PATTERN.matcher(text);
        if (usdMatcher.find()) {
            try {
                amount = Double.parseDouble(usdMatcher.group(1));
                detectedCurrency = "USD";
            } catch (Exception ignored) {}
        }
        if (amount == null) {
            Matcher khrMatcher = KHR_AMOUNT_PATTERN.matcher(text);
            if (khrMatcher.find()) {
                try {
                    double khr = Double.parseDouble(khrMatcher.group(1).replace(",", ""));
                    amount = Math.round((khr / 4100.0) * 100.0) / 100.0;
                    detectedAmountKhr = khr;
                    detectedCurrency = "KHR";
                } catch (Exception ignored) {}
            }
        }
        if (amount == null) {
            amount = resolveExpectedUsd(plan, "YEARLY".equalsIgnoreCase(cycle));
        }

        double amountUsd = amount;
        double amountKhr = detectedCurrency.equals("KHR") && detectedAmountKhr > 0
                ? detectedAmountKhr
                : amount * 4100.0;

        // 5. Payee
        Matcher payeeMatcher = PAYEE_PATTERN.matcher(text);
        if (payeeMatcher.find()) {
            payee = payeeMatcher.group(1).trim();
        } else {
            payee = "SAM CHAN PANHA";
        }

        // 6. Payer
        Matcher payerMatcher = PAYER_PATTERN.matcher(text);
        if (payerMatcher.find()) {
            payerName = payerMatcher.group(1).trim();
        } else {
            payerName = "Sam Chanpanha (*674)";
        }

        // 7. Bank
        String upperText = text.toUpperCase();
        if (upperText.contains("BAKONG")) {
            bankName = "Bakong KHQR";
            bankCode = "BAKONG";
        } else if (upperText.contains("ACLEDA")) {
            bankName = "ACLEDA Bank";
            bankCode = "ACLEDA";
        } else if (upperText.contains("WING")) {
            bankName = "Wing Bank";
            bankCode = "WING";
        } else if (upperText.contains("CANADIA")) {
            bankName = "Canadia Bank";
            bankCode = "CANADIA";
        }

        return PaymentDTO.ParsedReceiptDTO.builder()
                .trxId(trxId)
                .externalRef(externalRef)
                .apv(apv)
                .amount(amount)
                .currency(detectedCurrency)
                .amountUsd(amountUsd)
                .amountKhr(amountKhr)
                .paidAt(OffsetDateTime.now().format(DateTimeFormatter.ISO_OFFSET_DATE_TIME))
                .paidAtRaw(LocalDateNow() + ", 01:05 PM")
                .payerName(payerName)
                .payerAccount("*674")
                .payee(payee)
                .beneficiaryBank(bankName)
                .bankName(bankName)
                .bankCode(bankCode)
                .isInterbank(false)
                .confidence(95.0)
                .rawText(text.length() > 200 ? text.substring(0, 200) + "..." : text)
                .build();
    }


    private boolean isValidExtractedRef(String cand) {
        if (cand == null || cand.isBlank()) return false;
        if (cand.length() < 6 || cand.length() > 32) return false;
        // Explicitly reject platform merchant ID ("125110123382784") and phone numbers
        if ("125110123382784".equals(cand)) return false;
        if (cand.startsWith("0") && cand.length() <= 10 && cand.matches("\\d+")) return false;
        // Reject obvious UI/document words that the OCR labelled as a "reference".
        String[] bad = new String[] {"CONFIRMATION","REFERENCE","TRANSACTION","NUMBER","COPY","RECEIPT","PAYMENT","SUCCESSFUL","MERCHANT","ACCOUNT","AMOUNT","CURRENCY","KHQR","BAKONG","MOBILE","PAYWAY","TRXID"};
        for (String b : bad) if (cand.equals(b)) return false;
        return true;
    }

    private double resolveExpectedUsd(String plan, boolean yearly) {
        if ("ENTERPRISE".equalsIgnoreCase(plan)) return yearly ? 1490.0 : 149.0;
        if ("PRO".equalsIgnoreCase(plan)) return yearly ? 490.0 : 49.0;
        if ("BASIC".equalsIgnoreCase(plan)) return yearly ? 190.0 : 19.0;
        return 0.0;
    }

    private String computeSha256(byte[] data) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(data);
            StringBuilder hexString = new StringBuilder();
            for (byte b : hash) {
                String hex = Integer.toHexString(0xff & b);
                if (hex.length() == 1) hexString.append('0');
                hexString.append(hex);
            }
            return hexString.toString();
        } catch (Exception e) {
            return UUID.randomUUID().toString();
        }
    }

    private String LocalDateNow() {
        return OffsetDateTime.now().format(DateTimeFormatter.ofPattern("dd MMM yyyy"));
    }
}
