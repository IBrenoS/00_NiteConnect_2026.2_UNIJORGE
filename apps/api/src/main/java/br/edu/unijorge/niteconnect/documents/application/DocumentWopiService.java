package br.edu.unijorge.niteconnect.documents.application;

import br.edu.unijorge.niteconnect.documents.domain.DocxIntegrity;
import br.edu.unijorge.niteconnect.documents.infrastructure.DocumentRepository;
import br.edu.unijorge.niteconnect.documents.infrastructure.DocumentRepository.Document;
import br.edu.unijorge.niteconnect.documents.infrastructure.DocumentRepository.Session;
import br.edu.unijorge.niteconnect.documents.infrastructure.DocumentRepository.WopiLock;
import br.edu.unijorge.niteconnect.shared.api.ApiException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.net.URI;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

@Service
@ConditionalOnProperty(prefix="nite.documents",name="enabled",havingValue="true")
public class DocumentWopiService {
    private static final SecureRandom RANDOM=new SecureRandom();
    private static final long SESSION_HOURS=8;
    private static final long LOCK_MINUTES=30;
    private final DocumentRepository repo;
    private final DocumentCoreService core;
    private final DocumentObjectStore store;
    private final CollaboraDiscovery discovery;
    private final Clock clock;
    private final URI wopiBase;

    public DocumentWopiService(DocumentRepository repo,DocumentCoreService core,DocumentObjectStore store,
                               CollaboraDiscovery discovery,Clock clock,
                               @Value("${nite.documents.wopi-public-base-url}") String publicUrl,
                               @Value("${nite.documents.allow-insecure-dev:false}") boolean allowInsecureLocal) {
        this.repo=repo;this.core=core;this.store=store;this.discovery=discovery;this.clock=clock;
        this.wopiBase=URI.create(publicUrl);
        boolean localHttp=wopiBase.getHost()!=null && allowInsecureLocal && "http".equals(wopiBase.getScheme())
                && java.util.Set.of("localhost","127.0.0.1","host.docker.internal").contains(wopiBase.getHost());
        if(wopiBase.getHost()==null || (!"https".equals(wopiBase.getScheme()) && !localHttp)) {
            throw new IllegalArgumentException("WOPI requer URL pública HTTPS (HTTP somente no desenvolvimento opt-in)");
        }
    }
    public record Launch(String actionUrl,String accessToken,long accessTokenTtl,String wopiSrc) {}
    private record Authenticated(Document document, Session session) {}
    public record Outcome(int status,String currentLock,Instant modifiedAt) {}

    @Transactional
    public Launch launch(UUID actor, UUID id) {
        Document doc=core.require(actor,id);
        if(!DocumentLibraryService.DOCX.equals(doc.mimeType())) throw ApiException.invalid("Edição WOPI disponível apenas para DOCX");
        boolean writable=core.canWrite(actor,doc);
        // Discovery is checked before allocating an editor token (fail closed on misconfiguration).
        String action=discovery.editUrl();
        byte[] entropy=new byte[32];RANDOM.nextBytes(entropy);
        String token=Base64.getUrlEncoder().withoutPadding().encodeToString(entropy);
        Instant now=clock.instant();
        Instant expires=now.plus(SESSION_HOURS,ChronoUnit.HOURS);
        repo.createSession(id,actor,doc.versionId(),DocxIntegrity.sha256(token.getBytes(StandardCharsets.UTF_8)),writable,now,expires);
        String base=wopiBase.toString().replaceAll("/+$","");
        String wopiSrc=base+"/wopi/files/"+id;
        String delim=action.contains("?")?(action.endsWith("?")||action.endsWith("&")?"":"&"):"?";
        String actionUrl=action+delim+"WOPISrc="+URLEncoder.encode(wopiSrc,StandardCharsets.UTF_8);
        // Browser posts access_token to actionUrl in a hidden form targeting the editor iframe.
        return new Launch(actionUrl,token,expires.toEpochMilli(),wopiSrc);
    }
    private Authenticated session(UUID id,String token) {
        if(token==null || token.length()<32 || token.length()>512) throw ApiException.notFound();
        Session session=repo.session(id,DocxIntegrity.sha256(token.getBytes(StandardCharsets.UTF_8)),clock.instant());
        Document doc=repo.require(id);
        core.requireAccess(session.actorId(),doc); // revocation and current admin status rechecked on every WOPI request
        return new Authenticated(doc,session);
    }
    @Transactional(readOnly=true)
    public Map<String,Object> checkFileInfo(UUID id,String token) {
        Authenticated auth=session(id,token);
        Document doc=auth.document();
        var info=new LinkedHashMap<String,Object>();
        info.put("BaseFileName",doc.title());
        info.put("OwnerId",(doc.ownerId()!=null?doc.ownerId():doc.projectId()!=null?doc.projectId():doc.id()).toString());
        info.put("Size",doc.size());
        info.put("Version",Long.toString(doc.version()));
        info.put("LastModifiedTime",doc.versionAt().toString());
        info.put("UserId",auth.session().actorId().toString());
        info.put("UserFriendlyName",core.friendlyName(auth.session().actorId()));
        boolean canWrite=auth.session().canWrite() && core.canWrite(auth.session().actorId(),doc);
        info.put("UserCanWrite",canWrite);
        info.put("ReadOnly",!canWrite);
        info.put("SupportsUpdate",true);
        info.put("SupportsLocks",true);
        info.put("SupportsGetLock",true);
        info.put("UserCanNotWriteRelative",true);
        info.put("SupportsRename",false);
        return info;
    }
    @Transactional
    public byte[] getFile(UUID id,String token) {
        Authenticated auth=session(id,token);
        byte[] data=core.readVerified(auth.document());
        repo.recordOpened(id,auth.session().actorId()); // Actual WOPI file read, not a launched-but-unused session.
        return data;
    }

    @Transactional
    public Outcome lock(UUID id,String token,String operation,String lock,String oldLock) {
        Authenticated auth=session(id,token);
        if(!auth.session().canWrite()) throw ApiException.forbidden();
        core.requireWrite(auth.session().actorId(),auth.document());
        repo.forUpdate(id);
        Instant now=clock.instant();
        WopiLock current=repo.lock(id,now);
        if("GET_LOCK".equals(operation)) return new Outcome(200,current==null?"":current.value(),null);
        if(lock==null || lock.isBlank() || lock.length()>1024) return new Outcome(400,null,null);
        Instant expiry=now.plus(LOCK_MINUTES,ChronoUnit.MINUTES);
        boolean success=switch(operation) {
            case "LOCK" -> oldLock==null ? repo.lockOrRefresh(id,lock,now,expiry)
                    : !oldLock.isBlank() && repo.relock(id,oldLock,lock,now,expiry);
            case "REFRESH_LOCK" -> repo.refresh(id,lock,now,expiry);
            case "UNLOCK" -> repo.unlock(id,lock,now);
            case "UNLOCK_AND_RELOCK" -> oldLock!=null && !oldLock.isBlank() && repo.relock(id,oldLock,lock,now,expiry);
            default -> false;
        };
        if(!success) return new Outcome(409,current==null?"":current.value(),null);
        return new Outcome(200,null,null);
    }

    @Transactional
    public Outcome putFile(UUID id,String token,String suppliedLock,byte[] bytes) {
        Authenticated auth=session(id,token);
        if(!auth.session().canWrite()) throw ApiException.forbidden();
        core.requireWrite(auth.session().actorId(),auth.document());
        DocxIntegrity.validate(bytes);
        Document doc=repo.forUpdate(id);
        core.requireAccess(auth.session().actorId(),doc);
        WopiLock current=repo.lock(id,clock.instant());
        if(current!=null && !current.value().equals(suppliedLock)) {
            return new Outcome(409,current.value(),null);
        }
        if(current==null && suppliedLock!=null && !suppliedLock.isBlank()) return new Outcome(409,"",null);
        // With no WOPI lock, prohibit saving from an editor opened on a stale document revision.
        if(current==null && !auth.session().sourceVersionId().equals(doc.versionId())) {
            return new Outcome(409,"",null);
        }
        String sha=DocxIntegrity.sha256(bytes);
        if(sha.equals(doc.sha256()) && bytes.length==doc.size()) return new Outcome(200,null,doc.versionAt());
        UUID objectId=UUID.randomUUID();
        store.put(objectId,bytes); // never overwrite an existing object
        try {
            UUID version=repo.promote(doc,objectId,bytes.length,sha,auth.session().actorId());
            repo.advanceSession(id,DocxIntegrity.sha256(token.getBytes(StandardCharsets.UTF_8)),
                    auth.session().sourceVersionId(),version);
        } catch(RuntimeException ex) {
            store.deleteOrphan(objectId); // best effort; crash reconciliation documented separately
            throw ex;
        }
        return new Outcome(200,null,clock.instant());
    }
}
