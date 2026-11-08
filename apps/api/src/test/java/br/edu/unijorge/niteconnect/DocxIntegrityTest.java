package br.edu.unijorge.niteconnect;

import br.edu.unijorge.niteconnect.documents.domain.DocxIntegrity;
import org.junit.jupiter.api.Test;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;
import static org.assertj.core.api.Assertions.*;

class DocxIntegrityTest {
    static byte[] docx(String text) throws Exception {
        var bytes=new ByteArrayOutputStream();
        try(var zip=new ZipOutputStream(bytes)) {
            entry(zip,"[Content_Types].xml","""
                    <?xml version="1.0" encoding="UTF-8"?>
                    <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
                      <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
                      <Default Extension="xml" ContentType="application/xml"/>
                      <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
                    </Types>
                    """);
            entry(zip,"_rels/.rels","""
                    <?xml version="1.0" encoding="UTF-8"?>
                    <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
                      <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
                    </Relationships>
                    """);
            entry(zip,"word/document.xml","""
                    <?xml version="1.0" encoding="UTF-8"?>
                    <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
                      <w:body><w:p><w:r><w:t>%s</w:t></w:r></w:p></w:body>
                    </w:document>
                    """.formatted(text));
        }
        return bytes.toByteArray();
    }
    private static void entry(ZipOutputStream zip,String name,String contents) throws Exception {
        zip.putNextEntry(new ZipEntry(name));
        zip.write(contents.getBytes(StandardCharsets.UTF_8));
        zip.closeEntry();
    }
    @Test void acceptsMinimalDocx() throws Exception {
        assertThatCode(()->DocxIntegrity.validate(docx("Olá"))).doesNotThrowAnyException();
    }
    @Test void rejectsOtherFormatsAndUnsafePaths() throws Exception {
        assertThatThrownBy(()->DocxIntegrity.validate("texto puro".getBytes())).isInstanceOf(RuntimeException.class);
        var bytes=new ByteArrayOutputStream();
        try(var zip=new ZipOutputStream(bytes)) { entry(zip,"../word/document.xml","x"); }
        assertThatThrownBy(()->DocxIntegrity.validate(bytes.toByteArray())).hasMessageContaining("inseguras");
    }
}
