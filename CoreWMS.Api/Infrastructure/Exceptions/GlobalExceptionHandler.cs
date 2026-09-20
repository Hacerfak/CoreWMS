using FluentValidation;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Mvc;

namespace CoreWMS.Api.Infrastructure.Exceptions;

public class GlobalExceptionHandler : IExceptionHandler
{
    private readonly ILogger<GlobalExceptionHandler> _logger;
    private readonly IWebHostEnvironment _env;

    public GlobalExceptionHandler(ILogger<GlobalExceptionHandler> logger, IWebHostEnvironment env)
    {
        _logger = logger;
        _env = env;
    }

    public async ValueTask<bool> TryHandleAsync(HttpContext httpContext, Exception exception, CancellationToken cancellationToken)
    {
        _logger.LogError(exception, "Ocorreu uma exceção: {Message}", exception.Message);

        var problemDetails = new ProblemDetails
        {
            Instance = httpContext.Request.Path
        };

        switch (exception)
        {
            case ValidationException fluentException:
                problemDetails.Title = "Erro de Validação";
                problemDetails.Status = StatusCodes.Status400BadRequest;
                problemDetails.Detail = "Um ou mais erros de validação ocorreram.";
                problemDetails.Extensions["errors"] = fluentException.Errors
                    .GroupBy(x => x.PropertyName, x => x.ErrorMessage)
                    .ToDictionary(x => x.Key, x => x.ToArray());
                break;
            case UnauthorizedAccessException:
                problemDetails.Title = "Não Autorizado";
                problemDetails.Status = StatusCodes.Status401Unauthorized;
                problemDetails.Detail = exception.Message;
                break;
            case KeyNotFoundException:
                problemDetails.Title = "Não Encontrado";
                problemDetails.Status = StatusCodes.Status404NotFound;
                problemDetails.Detail = exception.Message;
                break;
            case InvalidOperationException:
            case ArgumentException:
                problemDetails.Title = "Requisição Inválida";
                problemDetails.Status = StatusCodes.Status400BadRequest;
                problemDetails.Detail = exception.Message;
                break;
            default:
                problemDetails.Title = "Erro Interno do Servidor";
                problemDetails.Status = StatusCodes.Status500InternalServerError;
                // Proteção contra vazamento de dados em Produção
                problemDetails.Detail = _env.IsDevelopment()
                    ? exception.Message
                    : "Ocorreu um erro inesperado no servidor. A equipa técnica foi notificada.";
                break;
        }

        httpContext.Response.StatusCode = problemDetails.Status.Value;
        await httpContext.Response.WriteAsJsonAsync(problemDetails, cancellationToken);

        return true;
    }
}