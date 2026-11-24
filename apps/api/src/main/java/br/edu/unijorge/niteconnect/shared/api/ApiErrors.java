package br.edu.unijorge.niteconnect.shared.api;

import jakarta.validation.ConstraintViolationException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import br.edu.unijorge.niteconnect.meetings.application.MeetingProviderApiException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.method.annotation.HandlerMethodValidationException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.servlet.HandlerMapping;

@RestControllerAdvice
public class ApiErrors {
    private static final Logger log = LoggerFactory.getLogger(ApiErrors.class);
    @ExceptionHandler(org.springframework.web.multipart.MaxUploadSizeExceededException.class)
    ProblemDetail uploadTooLarge(Exception ex) {
        return ProblemDetail.forStatusAndDetail(HttpStatus.PAYLOAD_TOO_LARGE, "Anexo excede o limite permitido");
    }
    @ExceptionHandler(ApiException.class)
    ProblemDetail domain(ApiException ex, HttpServletRequest request) {
        if (ex.status() == HttpStatus.FORBIDDEN) {
            Object route = request.getAttribute(HandlerMapping.BEST_MATCHING_PATTERN_ATTRIBUTE);
            log.warn("NITE API denied method={} route={}", request.getMethod(), route == null ? "unmatched" : route);
        }
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(ex.status(), ex.getMessage());
        if (ex.code() != null) problem.setProperty("code", ex.code());
        return problem;
    }
    @ExceptionHandler(MeetingProviderApiException.class)
    ProblemDetail meetingProvider(MeetingProviderApiException ex) {
        HttpStatus status = ex.authorizationFailure() ? HttpStatus.FORBIDDEN : HttpStatus.SERVICE_UNAVAILABLE;
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(status,
                "A integração Microsoft Graph não concluiu a operação.");
        problem.setProperty("code", ex.code());
        if (ex.operationId() != null) problem.setProperty("operationId", ex.operationId());
        return problem;
    }
    @ExceptionHandler({MethodArgumentNotValidException.class, HttpMessageNotReadableException.class,
            ConstraintViolationException.class, MethodArgumentTypeMismatchException.class,
            HandlerMethodValidationException.class})
    ProblemDetail invalid(Exception ex) {
        return ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, "Dados inválidos ou campos obrigatórios ausentes");
    }
    @ExceptionHandler(DataIntegrityViolationException.class)
    ProblemDetail conflict(DataIntegrityViolationException ex) {
        return ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, "Operação em conflito com os dados ou vínculos existentes");
    }
}
