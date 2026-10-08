# Etapa de construção (Build)
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

# Copia o arquivo de projeto e restaura as dependências
COPY ["CoreWMS.Api.csproj", "./"]
RUN dotnet restore "CoreWMS.Api.csproj"

# Copia o restante do código e compila
COPY . .
RUN dotnet publish "CoreWMS.Api.csproj" -c Release -o /app/publish /p:UseAppHost=false

# Etapa final (Runtime)
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS final
WORKDIR /app
EXPOSE 8080

RUN apt update && apt install -y \
    libgdiplus \
    libc6-dev \
    ttf-mscorefonts-installer \
    fontconfig \
    libfontconfig1 \
    libfreetype6 \
    && rm -rf /var/lib/apt/lists/*

# Copia os arquivos compilados da etapa anterior
COPY --from=build /app/publish .

# Define o ponto de entrada da aplicação
ENTRYPOINT ["dotnet", "CoreWMS.Api.dll"]