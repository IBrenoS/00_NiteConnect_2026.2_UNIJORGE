package br.edu.unijorge.niteconnect.documents.application;

import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.Test;

import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;

import static org.assertj.core.api.Assertions.assertThat;

class CollaboraDiscoveryTest {
    @Test
    void discoversDocxEditActionFromWriterAppByExtension() throws Exception {
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/hosting/discovery", exchange -> {
            String actionUrl = "http://127.0.0.1:" + server.getAddress().getPort()
                    + "/browser/abc/cool.html?";
            String discovery = "<wopi-discovery><net-zone><app name=\"writer\">"
                    + "<action name=\"edit\" ext=\"docx\" urlsrc=\"" + actionUrl + "\"/>"
                    + "</app></net-zone></wopi-discovery>";
            byte[] body = discovery.getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(200, body.length);
            try (var output = exchange.getResponseBody()) {
                output.write(body);
            }
        });
        server.start();
        try {
            String base = "http://127.0.0.1:" + server.getAddress().getPort();

            assertThat(new CollaboraDiscovery(base + "/hosting/discovery").editUrl())
                    .isEqualTo(base + "/browser/abc/cool.html?");
        } finally {
            server.stop(0);
        }
    }

    @Test
    void usesConfiguredBrowserOriginWhenDiscoveryUsesDockerGatewayHost() throws Exception {
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/hosting/discovery", exchange -> {
            String actionUrl = "http://localhost:" + server.getAddress().getPort()
                    + "/browser/abc/cool.html?";
            String discovery = "<wopi-discovery><net-zone><app name=\"writer\">"
                    + "<action name=\"edit\" ext=\"docx\" urlsrc=\"" + actionUrl + "\"/>"
                    + "</app></net-zone></wopi-discovery>";
            byte[] body = discovery.getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(200, body.length);
            try (var output = exchange.getResponseBody()) {
                output.write(body);
            }
        });
        server.start();
        try {
            int port = server.getAddress().getPort();
            String internalDiscovery = "http://127.0.0.1:" + port + "/hosting/discovery";
            String publicOrigin = "http://localhost:" + port;

            assertThat(new CollaboraDiscovery(internalDiscovery, publicOrigin).editUrl())
                    .isEqualTo(publicOrigin + "/browser/abc/cool.html?");
        } finally {
            server.stop(0);
        }
    }
}
