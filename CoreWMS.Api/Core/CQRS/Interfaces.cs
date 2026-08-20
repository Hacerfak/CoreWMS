namespace CoreWMS.Api.Core.CQRS;

// --- COMMANDS (Ações que alteram estado ou processam regras complexas) ---
public interface ICommand<TResponse> { }

public interface ICommandHandler<in TCommand, TResponse> where TCommand : ICommand<TResponse>
{
    Task<TResponse> HandleAsync(TCommand command, CancellationToken cancellationToken = default);
}

// --- QUERIES (Ações que apenas leem dados) ---
public interface IQuery<TResponse> { }

public interface IQueryHandler<in TQuery, TResponse> where TQuery : IQuery<TResponse>
{
    Task<TResponse> HandleAsync(TQuery query, CancellationToken cancellationToken = default);
}