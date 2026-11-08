package br.edu.unijorge.niteconnect.documents.api;

import br.edu.unijorge.niteconnect.documents.application.DocumentWopiService;
import br.edu.unijorge.niteconnect.documents.domain.DocxIntegrity;
import br.edu.unijorge.niteconnect.shared.api.ApiException;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import java.io.IOException;
import java.util.Map;
import java.util.UUID;

/** WOPI callbacks use capability tokens, never the end-user's Entra Bearer token. */
@RestController
@ConditionalOnProperty(prefix="nite.documents",name="enabled",havingValue="true")
public class WopiController {
    private final DocumentWopiService service;
    public WopiController(DocumentWopiService service) {this.service=service;}

    @GetMapping("/wopi/files/{id}")
    Map<String,Object> info(@PathVariable UUID id,@RequestParam("access_token") String token) {
        return service.checkFileInfo(id,token);
    }
    @GetMapping("/wopi/files/{id}/contents")
    ResponseEntity<byte[]> read(@PathVariable UUID id,@RequestParam("access_token") String token) {
        return ResponseEntity.ok().contentType(MediaType.APPLICATION_OCTET_STREAM).body(service.getFile(id,token));
    }
    @PostMapping("/wopi/files/{id}")
    ResponseEntity<Void> lock(@PathVariable UUID id,@RequestParam("access_token") String token,
                              @RequestHeader(value="X-WOPI-Override",required=false) String operation,
                              @RequestHeader(value="X-WOPI-Lock",required=false) String requested,
                              @RequestHeader(value="X-WOPI-OldLock",required=false) String old) {
        if(operation==null || !java.util.Set.of("LOCK","REFRESH_LOCK","UNLOCK","UNLOCK_AND_RELOCK","GET_LOCK").contains(operation))
            throw ApiException.invalid("Operação WOPI não habilitada");
        var result=service.lock(id,token,operation,requested,old);
        return response(result);
    }
    @PostMapping("/wopi/files/{id}/contents")
    ResponseEntity<?> save(@PathVariable UUID id,@RequestParam("access_token") String token,
                              @RequestHeader(value="X-WOPI-Lock",required=false) String lock,
                              HttpServletRequest request) throws IOException {
        byte[] payload=request.getInputStream().readNBytes(DocxIntegrity.MAX_BYTES+1);
        var result=service.putFile(id,token,lock,payload);
        if(result.status()==200 && result.modifiedAt()!=null) {
            return ResponseEntity.ok().header("X-WOPI-LastModifiedTime",result.modifiedAt().toString())
                    .body(Map.of("LastModifiedTime",result.modifiedAt().toString()));
        }
        return response(result);
    }
    private ResponseEntity<Void> response(DocumentWopiService.Outcome value) {
        var result=ResponseEntity.status(value.status());
        if(value.currentLock()!=null) result.header("X-WOPI-Lock",value.currentLock());
        if(value.modifiedAt()!=null) result.header("X-WOPI-LastModifiedTime",value.modifiedAt().toString());
        return result.build();
    }
}
