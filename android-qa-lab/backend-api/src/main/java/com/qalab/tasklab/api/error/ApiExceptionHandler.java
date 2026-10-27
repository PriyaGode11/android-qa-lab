package com.qalab.tasklab.api.error;

import java.time.Instant;

import jakarta.servlet.http.HttpServletRequest;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

/** Every error leaves the API in the same JSON shape, with a message a person can act on. */
@RestControllerAdvice
public class ApiExceptionHandler {

    public record ApiError(int status, String error, String message, String path, Instant timestamp) {
    }

    @ExceptionHandler(ApiException.class)
    public ResponseEntity<ApiError> handle(ApiException ex, HttpServletRequest request) {
        return body(ex.getStatus(), ex.getMessage(), request);
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiError> handle(MethodArgumentNotValidException ex, HttpServletRequest request) {
        String message = ex.getBindingResult().getFieldErrors().stream()
            .map(e -> e.getDefaultMessage())
            .findFirst()
            .orElse("Invalid request");
        return body(HttpStatus.BAD_REQUEST, message, request);
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<ApiError> handle(HttpMessageNotReadableException ex, HttpServletRequest request) {
        Throwable cause = ex.getMostSpecificCause();
        String detail = cause instanceof IllegalArgumentException ? cause.getMessage() : "malformed JSON";
        return body(HttpStatus.BAD_REQUEST, "Invalid request body: " + detail, request);
    }

    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    public ResponseEntity<ApiError> handle(MethodArgumentTypeMismatchException ex, HttpServletRequest request) {
        return body(HttpStatus.BAD_REQUEST, "Invalid value for '" + ex.getName() + "': " + ex.getValue(), request);
    }

    private static ResponseEntity<ApiError> body(HttpStatus status, String message, HttpServletRequest request) {
        return ResponseEntity.status(status)
            .body(new ApiError(status.value(), status.getReasonPhrase(), message, request.getRequestURI(), Instant.now()));
    }
}
