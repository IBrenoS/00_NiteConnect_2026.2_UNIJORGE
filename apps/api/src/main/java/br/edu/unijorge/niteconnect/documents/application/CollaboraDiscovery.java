package br.edu.unijorge.niteconnect.documents.application;

import br.edu.unijorge.niteconnect.shared.api.ApiException;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.w3c.dom.Element;
import javax.xml.XMLConstants;
import javax.xml.parsers.DocumentBuilderFactory;
import java.io.ByteArrayInputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;

/** Fetches the Collabora-advertised edit action (versioned /browser/.../cool.html); no hard-coded URL. */
@Component
@ConditionalOnProperty(prefix="nite.documents", name="enabled", havingValue="true")
public class CollaboraDiscovery {
    private final URI discovery;
    private final URI browserOrigin;
    private final HttpClient client=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(4))
            .followRedirects(HttpClient.Redirect.NEVER).build();

    @Autowired
    public CollaboraDiscovery(@Value("${nite.documents.collabora.discovery-url}") String url,
                              @Value("${nite.documents.collabora.browser-origin:}") String browserOrigin) {
        this.discovery=URI.create(url);
        this.browserOrigin=browserOrigin.isBlank() ? this.discovery : URI.create(browserOrigin);
        if(!"https".equals(discovery.getScheme()) && !"http".equals(discovery.getScheme())) {
            throw new IllegalArgumentException("URL de discovery inválida");
        }
        if(this.browserOrigin.getHost()==null || (!"https".equals(this.browserOrigin.getScheme())
                && !"http".equals(this.browserOrigin.getScheme()))) {
            throw new IllegalArgumentException("Origem do navegador Collabora inválida");
        }
    }
    public CollaboraDiscovery(String url) {
        this(url, url);
    }
    public String editUrl() {
        try {
            var request=HttpRequest.newBuilder(discovery).timeout(Duration.ofSeconds(7)).GET().build();
            var response=client.send(request,HttpResponse.BodyHandlers.ofByteArray());
            if(response.statusCode()!=200 || response.body().length>1024*1024)
                throw unavailable();
            var factory=DocumentBuilderFactory.newInstance();
            factory.setFeature(XMLConstants.FEATURE_SECURE_PROCESSING,true);
            factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl",true);
            factory.setFeature("http://xml.org/sax/features/external-general-entities",false);
            factory.setFeature("http://xml.org/sax/features/external-parameter-entities",false);
            factory.setXIncludeAware(false);
            factory.setExpandEntityReferences(false);
            var xml=factory.newDocumentBuilder().parse(new ByteArrayInputStream(response.body()));
            var apps=xml.getElementsByTagName("app");
            for(int i=0;i<apps.getLength();i++) {
                Element app=(Element)apps.item(i);
                var actions=app.getElementsByTagName("action");
                for(int j=0;j<actions.getLength();j++) {
                    Element action=(Element)actions.item(j);
                    if("edit".equals(action.getAttribute("name"))
                            && "docx".equalsIgnoreCase(action.getAttribute("ext"))) {
                        String url=action.getAttribute("urlsrc");
                        URI uri=URI.create(url);
                        if(browserOrigin.getHost().equalsIgnoreCase(uri.getHost()) && uri.getPort()==browserOrigin.getPort()
                                && browserOrigin.getScheme().equals(uri.getScheme()))
                            return url;
                    }
                }
            }
            throw unavailable();
        } catch(ApiException ex) {
            throw ex;
        } catch(Exception ex) {
            throw unavailable();
        }
    }
    private static ApiException unavailable() {
        return new ApiException(HttpStatus.SERVICE_UNAVAILABLE,"Collabora CODE indisponível ou sem suporte a DOCX");
    }
}
