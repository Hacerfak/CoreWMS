using System.Reflection;

namespace CoreWMS.Api.Infrastructure.Extensions;

public static class EndpointExtensions
{
    public static IEndpointRouteBuilder MapAllEndpoints(this IEndpointRouteBuilder app)
    {
        var assembly = Assembly.GetExecutingAssembly();

        var endpointMethods = assembly.GetTypes()
            .SelectMany(t => t.GetMethods(BindingFlags.Static | BindingFlags.Public))
            .Where(m =>
                m.Name != nameof(MapAllEndpoints) && // <-- ESSA É A TRAVA DE SEGURANÇA!
                m.Name.StartsWith("Map") &&
                m.Name.EndsWith("Endpoints") &&
                m.GetParameters().Length == 1 &&
                m.GetParameters()[0].ParameterType == typeof(IEndpointRouteBuilder))
            .ToList();

        foreach (var method in endpointMethods)
        {
            method.Invoke(null, new object[] { app });
        }

        return app;
    }
}