using FluentValidation;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Mvc;

namespace CoreWMS.Api.Infrastructure.Exceptions;

public class GlobalExceptionHandler : IExceptionHandler
{
    private readonly ILogger<GlobalExceptionHandler> _logger;

    public GlobalExceptionHandler(ILogger<GlobalExceptionHandler> logger)
    {
        _logger = logger;
    }

    public async ValueTask<bool> TryHandleAsync(HttpContext httpContext, Exception exception, CancellationToken cancellationToken)
    {
        _logger.LogError(exception, "Ocorreu uma exceção: {Message}", exception.Message);

        var problemDetails = new ProblemDetails
        {
            Instance = httpContext.Request.Path
        };

        // 1. Se for erro de validação (FluentValidation), devolve 400 com os campos
        if (exception is ValidationException fluentException)
        {
            problemDetails.Title = "Erro de Validação";
            problemDetails.Status = StatusCodes.Status400BadRequest;
            problemDetails.Detail = "Um ou mais erros de validação ocorreram.";

            // Agrupa os erros por campo para o frontend saber onde pintar de vermelho
            problemDetails.Extensions["errors"] = fluentException.Errors
                .GroupBy(x => x.PropertyName, x => x.ErrorMessage)
                .ToDictionary(x => x.Key, x => x.ToArray());
        }
        // 2. Se for qualquer outro erro (banco, null reference, etc), devolve 500
        else
        {
            problemDetails.Title = "Erro Interno do Servidor";
            problemDetails.Status = StatusCodes.Status500InternalServerError;
            problemDetails.Detail = exception.Message; // Pode ocultar em prod, mas excelente para dev
        }

        httpContext.Response.StatusCode = problemDetails.Status.Value;
        await httpContext.Response.WriteAsJsonAsync(problemDetails, cancellationToken);

        return true; // Diz ao .NET que a exceção foi tratada
    }
}