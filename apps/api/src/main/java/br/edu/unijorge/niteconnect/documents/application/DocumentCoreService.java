package br.edu.unijorge.niteconnect.documents.application;

import br.edu.unijorge.niteconnect.access.application.AccessService;
import br.edu.unijorge.niteconnect.documents.domain.DocxIntegrity;
import br.edu.unijorge.niteconnect.documents.infrastructure.DocumentRepository;
import br.edu.unijorge.niteconnect.documents.infrastructure.DocumentRepository.Document;
import br.edu.unijorge.niteconnect.shared.api.ApiException;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.List;
import java.util.UUID;

@Service
@ConditionalOnProperty(prefix="nite.documents",name="enabled",havingValue="true")
public class DocumentCoreService {
    private final DocumentRepository repository;
    private final DocumentObjectStore store;
    private final AccessService access;

    public DocumentCoreService(DocumentRepository repository,DocumentObjectStore store,AccessService access) {
        this.repository=repository;this.store=store;this.access=access;
    }
    public record Summary(UUID id,String title,long revision,long size,String sha256) {
        static Summary of(Document d) {return new Summary(d.id(),d.title(),d.version(),d.size(),d.sha256());}
    }
    public void requireAccess(UUID actor, Document document) {
        access.requireActive(actor);
        if(!access.isAdministrator(actor) && (!"PERSONAL".equals(document.context()) || !actor.equals(document.ownerId()))) {
            throw ApiException.notFound();
        }
        if (!"PERSONAL".equals(document.context())) throw ApiException.notFound(); // project library belongs to 05.2
    }
    public String friendlyName(UUID actor) {
        return access.requireActive(actor).name();
    }
    @Transactional(readOnly=true)
    public Document require(UUID actor,UUID id) {
        Document doc=repository.require(id);
        requireAccess(actor,doc);
        return doc;
    }
    @Transactional(readOnly=true)
    public List<Summary> own(UUID actor) {
        access.requireActive(actor);
        return repository.own(actor).stream().map(Summary::of).toList();
    }
    @Transactional
    public Summary create(UUID actor,String title,byte[] data) {
        access.requireActive(actor);
        DocxIntegrity.validate(data);
        String name = title == null || title.isBlank() ? "Relatório Individual.docx" : title.strip();
        if (name.length() > 190 || name.contains("/") || name.contains("\\") || name.chars().anyMatch(Character::isISOControl)) {
            throw ApiException.invalid("Nome de documento inválido");
        }
        if(!name.toLowerCase(java.util.Locale.ROOT).endsWith(".docx")) name += ".docx";
        String hash=DocxIntegrity.sha256(data);
        UUID objectId=UUID.randomUUID();
        UUID id=UUID.randomUUID();
        store.put(objectId,data);
        try {
            repository.create(id,name,actor,objectId,data.length,hash);
        } catch(RuntimeException ex) {
            store.deleteOrphan(objectId);
            throw ex;
        }
        return Summary.of(repository.require(id));
    }
    @Transactional(readOnly=true)
    public byte[] read(UUID actor,UUID id) {
        Document doc=require(actor,id);
        return readVerified(doc);
    }
    public byte[] readVerified(Document doc) {
        byte[] bytes=store.get(doc.objectId());
        if(bytes.length!=doc.size() || !DocxIntegrity.sha256(bytes).equals(doc.sha256())) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE,"Integridade do documento não confirmada");
        }
        return bytes;
    }
}
