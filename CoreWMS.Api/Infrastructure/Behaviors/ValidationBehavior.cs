using FluentValidation;
using MediatR;

namespace CoreWMS.Api.Infrastructure.Behaviors;

public class ValidationBehavior<TRequest, TResponse> : IPipelineBehavior<TRequest, TResponse>
    where TRequest : notnull
{
    private readonly IEnumerable<IValidator<TRequest>> _validators;

    public ValidationBehavior(IEnumerable<IValidator<TRequest>> validators)
    {
        _validators = validators;
    }

    public async Task<TResponse> Handle(TRequest request, RequestHandlerDelegate<TResponse> next, CancellationToken cancellationToken)
    {
        // Se não houver validador para este comando, segue o fluxo
        if (!_validators.Any())
            return await next();

        var context = new ValidationContext<TRequest>(request);

        // Executa todas as validações de forma assíncrona
        var validationResults = await Task.WhenAll(_validators.Select(v => v.ValidateAsync(context, cancellationToken)));

        // Pega todos os erros encontrados
        var failures = validationResults.SelectMany(r => r.Errors).Where(f => f != null).ToList();

        // Se falhou, lança a exceção que será formatada pelo GlobalExceptionHandler
        if (failures.Count != 0)
            throw new ValidationException(failures);

        // Tudo válido! Segue para o Handler.
        return await next();
    }
}