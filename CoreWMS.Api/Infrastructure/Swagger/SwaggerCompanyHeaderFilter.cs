using Microsoft.OpenApi.Models;
using Swashbuckle.AspNetCore.SwaggerGen;

namespace CoreWMS.Api.Infrastructure.Swagger;

public class SwaggerCompanyHeaderFilter : IOperationFilter
{
    public void Apply(OpenApiOperation operation, OperationFilterContext context)
    {
        operation.Parameters ??= new List<OpenApiParameter>();

        operation.Parameters.Add(new OpenApiParameter
        {
            Name = "X-Company-Id",
            In = ParameterLocation.Header,
            Description = "ID da Empresa selecionada (GUID)",
            Required = false, // Deixamos false para não bloquear as rotas de Login
            Schema = new OpenApiSchema
            {
                Type = "string",
                Format = "uuid"
            }
        });
    }
}