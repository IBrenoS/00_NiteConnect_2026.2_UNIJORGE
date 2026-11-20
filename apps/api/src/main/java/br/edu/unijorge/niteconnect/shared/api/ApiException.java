package br.edu.unijorge.niteconnect.shared.api;

import org.springframework.http.HttpStatus;

public class ApiException extends RuntimeException {
    private final HttpStatus status;
    private final String code;
    public ApiException(HttpStatus status, String message) {
        this(status, message, null);
    }
    public ApiException(HttpStatus status, String message, String code) {
        super(message); this.status = status; this.code = code;
    }
    public HttpStatus status() { return status; }
    public String code() { return code; }
    public static ApiException forbidden() { return new ApiException(HttpStatus.FORBIDDEN, "Acesso não autorizado"); }
    public static ApiException notFound() { return new ApiException(HttpStatus.NOT_FOUND, "Recurso não encontrado"); }
    public static ApiException conflict(String message) { return new ApiException(HttpStatus.CONFLICT, message); }
    public static ApiException projectPaused() { return new ApiException(HttpStatus.CONFLICT, "Projeto pausado impede operações de execução", "PROJECT_PAUSED"); }
    public static ApiException invalid(String message) { return new ApiException(HttpStatus.BAD_REQUEST, message); }
    public static ApiException gone(String message) { return new ApiException(HttpStatus.GONE, message); }
}
