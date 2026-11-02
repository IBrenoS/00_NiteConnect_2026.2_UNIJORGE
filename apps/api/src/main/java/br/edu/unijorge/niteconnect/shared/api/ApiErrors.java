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

@RestControllerAdvice
public class ApiErrors {
    @ExceptionHandler(org.springframework.web.multipart.MaxUploadSizeExceededException.class)
    ProblemDetail uploadTooLarge(Exception ex) {
        return ProblemDetail.forStatusAndDetail(HttpStatus.PAYLOAD_TOO_LARGE, "Anexo excede o limite permitido");
    }
    @ExceptionHandler(ApiException.class)
    ProblemDetail domain(ApiException ex) {
        return ProblemDetail.forStatusAndDetail(ex.status(), ex.getMessage());
    }
    @ExceptionHandler(MeetingProviderApiException.class)
    ProblemDetail meetingProvider(MeetingProviderApiException ex) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.SERVICE_UNAVAILABLE,
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
