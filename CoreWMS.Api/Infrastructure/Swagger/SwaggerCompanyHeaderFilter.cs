using Microsoft.OpenApi;
using Swashbuckle.AspNetCore.SwaggerGen;

namespace CoreWMS.Api.Infrastructure.Swagger;

public class SwaggerCompanyHeaderFilter : IOperationFilter
{
    public void Apply(OpenApiOperation operation, OperationFilterContext context)
    {
        operation.Parameters ??= [];
        operation.Parameters.Add(new OpenApiParameter
        {
            Name = "X-Company-Id",
            In = ParameterLocation.Header,
            Description = "ID da Empresa selecionada (GUID)",
            Required = false,
            Schema = new OpenApiSchema
            {
                Type = JsonSchemaType.String,
                Format = "uuid"
            }
        });
    }
}