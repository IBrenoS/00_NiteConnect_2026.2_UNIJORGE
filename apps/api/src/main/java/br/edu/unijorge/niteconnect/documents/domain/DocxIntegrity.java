package br.edu.unijorge.niteconnect.documents.domain;

import br.edu.unijorge.niteconnect.shared.api.ApiException;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.HashSet;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

/** Validates the minimum OPC/DOCX package shape and bounds decompression before storing untrusted files. */
public final class DocxIntegrity {
    public static final int MAX_BYTES = 8 * 1024 * 1024;
    private DocxIntegrity() {}

    public static void validate(byte[] bytes) {
        if (bytes == null || bytes.length == 0 || bytes.length > MAX_BYTES) {
            throw ApiException.invalid("DOCX deve ter entre 1 byte e 8 MiB");
        }
        boolean contentTypes = false;
        boolean document = false;
        int entries = 0;
        long decompressed = 0;
        var seen = new HashSet<String>();
        try (ZipInputStream zip = new ZipInputStream(new ByteArrayInputStream(bytes))) {
            ZipEntry entry;
            byte[] chunk = new byte[8192];
            while ((entry = zip.getNextEntry()) != null) {
                String path = entry.getName();
                if (++entries > 512 || path.startsWith("/") || path.contains("..") || path.contains("\\")
                        || !seen.add(path) || path.toLowerCase(java.util.Locale.ROOT).endsWith("vbaproject.bin")) {
                    throw ApiException.invalid("DOCX contém entradas inseguras");
                }
                contentTypes |= path.equals("[Content_Types].xml");
                document |= path.equals("word/document.xml");
                int read;
                while ((read = zip.read(chunk)) >= 0) {
                    decompressed += read;
                    if (decompressed > 32L * 1024 * 1024) {
                        throw ApiException.invalid("DOCX excede o limite seguro de descompactação");
                    }
                }
                zip.closeEntry();
            }
        } catch (IOException ex) {
            throw ApiException.invalid("Pacote DOCX inválido");
        }
        if (!contentTypes || !document) throw ApiException.invalid("Arquivo não é um DOCX válido");
    }

    public static String sha256(byte[] value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value));
        } catch (NoSuchAlgorithmException ex) {
            throw new IllegalStateException("SHA-256 indisponível", ex);
        }
    }
}
