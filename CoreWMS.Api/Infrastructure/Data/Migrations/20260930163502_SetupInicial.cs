using System;
using System.Collections.Generic;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CoreWMS.Api.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class SetupInicial : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "BillingServices",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CompanyId = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: false),
                    Type = table.Column<int>(type: "integer", nullable: false),
                    SqlTemplate = table.Column<string>(type: "text", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_BillingServices", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Companies",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Cnpj = table.Column<string>(type: "character varying(14)", maxLength: 14, nullable: false),
                    CorporateName = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: false),
                    TradeName = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: true),
                    StateRegistration = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    MunicipalRegistration = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    Crt = table.Column<int>(type: "integer", nullable: false),
                    Cnae = table.Column<string>(type: "text", nullable: true),
                    Iest = table.Column<string>(type: "text", nullable: true),
                    NfeSerie = table.Column<int>(type: "integer", nullable: false),
                    NfeNextNumber = table.Column<int>(type: "integer", nullable: false),
                    Rntrc = table.Column<string>(type: "text", nullable: true),
                    Email = table.Column<string>(type: "text", nullable: true),
                    Phone = table.Column<string>(type: "text", nullable: true),
                    LogoBase64 = table.Column<string>(type: "text", nullable: true),
                    Street = table.Column<string>(type: "text", nullable: true),
                    Number = table.Column<string>(type: "text", nullable: true),
                    Complement = table.Column<string>(type: "text", nullable: true),
                    Neighborhood = table.Column<string>(type: "text", nullable: true),
                    CityCode = table.Column<int>(type: "integer", nullable: false),
                    CityName = table.Column<string>(type: "text", nullable: true),
                    State = table.Column<string>(type: "character varying(2)", maxLength: 2, nullable: false),
                    ZipCode = table.Column<string>(type: "text", nullable: true),
                    CertificateBytes = table.Column<byte[]>(type: "bytea", nullable: true),
                    CertificatePassword = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    CertificateExpiration = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    Environment = table.Column<int>(type: "integer", nullable: false),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Companies", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "CycleCountPlans",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CompanyId = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: false),
                    Status = table.Column<int>(type: "integer", nullable: false),
                    BlockMovements = table.Column<bool>(type: "boolean", nullable: false),
                    MaxRounds = table.Column<int>(type: "integer", nullable: false),
                    EnableAdjustments = table.Column<bool>(type: "boolean", nullable: false),
                    AssignedUserId = table.Column<Guid>(type: "uuid", nullable: true),
                    CustomerIds = table.Column<List<Guid>>(type: "uuid[]", nullable: false),
                    ProductIds = table.Column<List<Guid>>(type: "uuid[]", nullable: false),
                    LocationIds = table.Column<List<Guid>>(type: "uuid[]", nullable: false),
                    Batch = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CycleCountPlans", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "InventoryTransactions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CompanyId = table.Column<Guid>(type: "uuid", nullable: false),
                    CustomerId = table.Column<Guid>(type: "uuid", nullable: false),
                    ProductId = table.Column<Guid>(type: "uuid", nullable: false),
                    HandlingUnitId = table.Column<Guid>(type: "uuid", nullable: true),
                    LocationId = table.Column<Guid>(type: "uuid", nullable: true),
                    Type = table.Column<int>(type: "integer", nullable: false),
                    QuantityChange = table.Column<decimal>(type: "numeric(18,10)", precision: 18, scale: 10, nullable: false),
                    BalanceAfter = table.Column<decimal>(type: "numeric(18,10)", precision: 18, scale: 10, nullable: false),
                    SourceDocumentId = table.Column<Guid>(type: "uuid", nullable: true),
                    SourceDocumentNumber = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_InventoryTransactions", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "LabelTemplates",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ZplContent = table.Column<string>(type: "text", nullable: false),
                    WidthMm = table.Column<int>(type: "integer", nullable: false),
                    HeightMm = table.Column<int>(type: "integer", nullable: false),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_LabelTemplates", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "PrintAgents",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ApiKey = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PrintAgents", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "QualityReasons",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CompanyId = table.Column<Guid>(type: "uuid", nullable: false),
                    Code = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    Description = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_QualityReasons", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Roles",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Roles", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "StorageTypes",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Role = table.Column<int>(type: "integer", nullable: false),
                    AllowMixedProducts = table.Column<bool>(type: "boolean", nullable: false),
                    AllowMixedBatches = table.Column<bool>(type: "boolean", nullable: false),
                    CapacityStrategy = table.Column<int>(type: "integer", nullable: false),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_StorageTypes", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Users",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: false),
                    Email = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: false),
                    PasswordHash = table.Column<string>(type: "text", nullable: false),
                    IsMaster = table.Column<bool>(type: "boolean", nullable: false),
                    RefreshToken = table.Column<string>(type: "text", nullable: true),
                    RefreshTokenExpiryTime = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Users", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Warehouses",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Code = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    Name = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: false),
                    ClearanceHeight = table.Column<decimal>(type: "numeric(10,2)", precision: 10, scale: 2, nullable: false),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Warehouses", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Customers",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CompanyId = table.Column<Guid>(type: "uuid", nullable: false),
                    Cnpj = table.Column<string>(type: "character varying(14)", maxLength: 14, nullable: false),
                    CorporateName = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: false),
                    TradeName = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: true),
                    StateRegistration = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    IeIndicator = table.Column<int>(type: "integer", nullable: false),
                    MunicipalRegistration = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    Crt = table.Column<int>(type: "integer", nullable: false),
                    Cnae = table.Column<string>(type: "text", nullable: true),
                    Street = table.Column<string>(type: "text", nullable: true),
                    Number = table.Column<string>(type: "text", nullable: true),
                    Complement = table.Column<string>(type: "text", nullable: true),
                    Neighborhood = table.Column<string>(type: "text", nullable: true),
                    CityCode = table.Column<int>(type: "integer", nullable: false),
                    CityName = table.Column<string>(type: "text", nullable: true),
                    State = table.Column<string>(type: "character varying(2)", maxLength: 2, nullable: false),
                    ZipCode = table.Column<string>(type: "text", nullable: true),
                    Email = table.Column<string>(type: "text", nullable: true),
                    Phone = table.Column<string>(type: "text", nullable: true),
                    TracksBatch = table.Column<bool>(type: "boolean", nullable: false),
                    StrictBatch = table.Column<bool>(type: "boolean", nullable: false),
                    TracksManufacture = table.Column<bool>(type: "boolean", nullable: false),
                    StrictManufacture = table.Column<bool>(type: "boolean", nullable: false),
                    TracksExpiration = table.Column<bool>(type: "boolean", nullable: false),
                    StrictExpiration = table.Column<bool>(type: "boolean", nullable: false),
                    TracksSerial = table.Column<bool>(type: "boolean", nullable: false),
                    StrictSerial = table.Column<bool>(type: "boolean", nullable: false),
                    DefaultPickingStrategy = table.Column<int>(type: "integer", nullable: false),
                    DefaultPickingBaseDate = table.Column<int>(type: "integer", nullable: false),
                    MaxDailyInboundOrders = table.Column<int>(type: "integer", nullable: true),
                    MaxDailyOutboundOrders = table.Column<int>(type: "integer", nullable: true),
                    MinStockVolume = table.Column<int>(type: "integer", nullable: true),
                    MaxStockVolume = table.Column<int>(type: "integer", nullable: true),
                    RequiresBlindInbound = table.Column<bool>(type: "boolean", nullable: false),
                    RequiresBlindOutbound = table.Column<bool>(type: "boolean", nullable: false),
                    ReturnInvoicePerReferencedInvoice = table.Column<bool>(type: "boolean", nullable: false),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Customers", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Customers_Companies_CompanyId",
                        column: x => x.CompanyId,
                        principalTable: "Companies",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "PackagingTypes",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CompanyId = table.Column<Guid>(type: "uuid", nullable: false),
                    Code = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    Description = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: false),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PackagingTypes", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PackagingTypes_Companies_CompanyId",
                        column: x => x.CompanyId,
                        principalTable: "Companies",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "Printers",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    PrintAgentId = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Target = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: false),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Printers", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Printers_PrintAgents_PrintAgentId",
                        column: x => x.PrintAgentId,
                        principalTable: "PrintAgents",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "RolePermissions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    RoleId = table.Column<Guid>(type: "uuid", nullable: false),
                    Permission = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_RolePermissions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_RolePermissions_Roles_RoleId",
                        column: x => x.RoleId,
                        principalTable: "Roles",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "UserCompanyRoles",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    CompanyId = table.Column<Guid>(type: "uuid", nullable: false),
                    RoleId = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_UserCompanyRoles", x => x.Id);
                    table.ForeignKey(
                        name: "FK_UserCompanyRoles_Companies_CompanyId",
                        column: x => x.CompanyId,
                        principalTable: "Companies",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_UserCompanyRoles_Roles_RoleId",
                        column: x => x.RoleId,
                        principalTable: "Roles",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_UserCompanyRoles_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "Zones",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    WarehouseId = table.Column<Guid>(type: "uuid", nullable: false),
                    Code = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    Name = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: false),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Zones", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Zones_Warehouses_WarehouseId",
                        column: x => x.WarehouseId,
                        principalTable: "Warehouses",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "BillingCycles",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CompanyId = table.Column<Guid>(type: "uuid", nullable: false),
                    CustomerId = table.Column<Guid>(type: "uuid", nullable: false),
                    ReferenceMonth = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    StartDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    EndDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    Status = table.Column<int>(type: "integer", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_BillingCycles", x => x.Id);
                    table.ForeignKey(
                        name: "FK_BillingCycles_Customers_CustomerId",
                        column: x => x.CustomerId,
                        principalTable: "Customers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "CustomerTariffs",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CompanyId = table.Column<Guid>(type: "uuid", nullable: false),
                    CustomerId = table.Column<Guid>(type: "uuid", nullable: false),
                    BillingServiceId = table.Column<Guid>(type: "uuid", nullable: false),
                    UnitValue = table.Column<decimal>(type: "numeric(18,10)", precision: 18, scale: 10, nullable: false),
                    ValidFrom = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    ValidTo = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CustomerTariffs", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CustomerTariffs_BillingServices_BillingServiceId",
                        column: x => x.BillingServiceId,
                        principalTable: "BillingServices",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_CustomerTariffs_Customers_CustomerId",
                        column: x => x.CustomerId,
                        principalTable: "Customers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "FiscalOperationRules",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CompanyId = table.Column<Guid>(type: "uuid", nullable: false),
                    Description = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: false),
                    OperationType = table.Column<int>(type: "integer", nullable: false),
                    CfopStateInternal = table.Column<string>(type: "character varying(4)", maxLength: 4, nullable: false),
                    CfopInterstate = table.Column<string>(type: "character varying(4)", maxLength: 4, nullable: false),
                    CstCsosnIcms = table.Column<string>(type: "character varying(3)", maxLength: 3, nullable: false),
                    CstPisCofins = table.Column<string>(type: "character varying(2)", maxLength: 2, nullable: false),
                    CstIpi = table.Column<string>(type: "character varying(2)", maxLength: 2, nullable: false),
                    CstIbs = table.Column<string>(type: "text", nullable: true),
                    AliqIbs = table.Column<decimal>(type: "numeric", nullable: false),
                    CstCbs = table.Column<string>(type: "text", nullable: true),
                    AliqCbs = table.Column<decimal>(type: "numeric", nullable: false),
                    AdditionalNotes = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    SpecificCustomerId = table.Column<Guid>(type: "uuid", nullable: true),
                    SpecificDestinationState = table.Column<string>(type: "character varying(2)", maxLength: 2, nullable: true),
                    SpecificNcmStart = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: true),
                    Priority = table.Column<int>(type: "integer", nullable: false),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_FiscalOperationRules", x => x.Id);
                    table.ForeignKey(
                        name: "FK_FiscalOperationRules_Companies_CompanyId",
                        column: x => x.CompanyId,
                        principalTable: "Companies",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_FiscalOperationRules_Customers_SpecificCustomerId",
                        column: x => x.SpecificCustomerId,
                        principalTable: "Customers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "InboundOrders",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CompanyId = table.Column<Guid>(type: "uuid", nullable: false),
                    CustomerId = table.Column<Guid>(type: "uuid", nullable: true),
                    IssuerCnpj = table.Column<string>(type: "character varying(14)", maxLength: 14, nullable: false),
                    IssuerName = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: false),
                    AccessKey = table.Column<string>(type: "character varying(44)", maxLength: 44, nullable: false),
                    RawXml = table.Column<string>(type: "text", nullable: false),
                    IssueDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    Status = table.Column<int>(type: "integer", nullable: false),
                    LastSefazManifestType = table.Column<int>(type: "integer", nullable: true),
                    SefazManifestProtocol = table.Column<string>(type: "text", nullable: true),
                    SefazManifestDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    SefazManifestJustification = table.Column<string>(type: "text", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_InboundOrders", x => x.Id);
                    table.ForeignKey(
                        name: "FK_InboundOrders_Companies_CompanyId",
                        column: x => x.CompanyId,
                        principalTable: "Companies",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_InboundOrders_Customers_CustomerId",
                        column: x => x.CustomerId,
                        principalTable: "Customers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "Products",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CompanyId = table.Column<Guid>(type: "uuid", nullable: false),
                    CustomerId = table.Column<Guid>(type: "uuid", nullable: false),
                    Sku = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    Description = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    BaseUnit = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false),
                    BaseBarcode = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    Ncm = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: true),
                    Cest = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: true),
                    Origin = table.Column<int>(type: "integer", nullable: false),
                    TracksBatch = table.Column<bool>(type: "boolean", nullable: false),
                    StrictBatch = table.Column<bool>(type: "boolean", nullable: false),
                    TracksManufacture = table.Column<bool>(type: "boolean", nullable: false),
                    StrictManufacture = table.Column<bool>(type: "boolean", nullable: false),
                    TracksExpiration = table.Column<bool>(type: "boolean", nullable: false),
                    StrictExpiration = table.Column<bool>(type: "boolean", nullable: false),
                    TracksSerial = table.Column<bool>(type: "boolean", nullable: false),
                    StrictSerial = table.Column<bool>(type: "boolean", nullable: false),
                    PickingStrategy = table.Column<int>(type: "integer", nullable: false),
                    PickingBaseDate = table.Column<int>(type: "integer", nullable: false),
                    InboundShelfLifeToleranceDays = table.Column<int>(type: "integer", nullable: true),
                    OutboundShelfLifeToleranceDays = table.Column<int>(type: "integer", nullable: true),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Products", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Products_Companies_CompanyId",
                        column: x => x.CompanyId,
                        principalTable: "Companies",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_Products_Customers_CustomerId",
                        column: x => x.CustomerId,
                        principalTable: "Customers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "UserCustomers",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    CustomerId = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_UserCustomers", x => x.Id);
                    table.ForeignKey(
                        name: "FK_UserCustomers_Customers_CustomerId",
                        column: x => x.CustomerId,
                        principalTable: "Customers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_UserCustomers_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "Locations",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ZoneId = table.Column<Guid>(type: "uuid", nullable: false),
                    StorageTypeId = table.Column<Guid>(type: "uuid", nullable: false),
                    Code = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    FullPath = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    BaseCapacity = table.Column<int>(type: "integer", nullable: false),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Locations", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Locations_StorageTypes_StorageTypeId",
                        column: x => x.StorageTypeId,
                        principalTable: "StorageTypes",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_Locations_Zones_ZoneId",
                        column: x => x.ZoneId,
                        principalTable: "Zones",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "BillingItems",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    BillingCycleId = table.Column<Guid>(type: "uuid", nullable: false),
                    BillingServiceId = table.Column<Guid>(type: "uuid", nullable: false),
                    Description = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    QuantityTotal = table.Column<decimal>(type: "numeric(18,10)", precision: 18, scale: 10, nullable: false),
                    ServiceTotal = table.Column<decimal>(type: "numeric(18,10)", precision: 18, scale: 10, nullable: false),
                    StatementDataJson = table.Column<string>(type: "jsonb", nullable: true),
                    ManualNotes = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_BillingItems", x => x.Id);
                    table.ForeignKey(
                        name: "FK_BillingItems_BillingCycles_BillingCycleId",
                        column: x => x.BillingCycleId,
                        principalTable: "BillingCycles",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_BillingItems_BillingServices_BillingServiceId",
                        column: x => x.BillingServiceId,
                        principalTable: "BillingServices",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "InventoryBalances",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CompanyId = table.Column<Guid>(type: "uuid", nullable: false),
                    CustomerId = table.Column<Guid>(type: "uuid", nullable: false),
                    ProductId = table.Column<Guid>(type: "uuid", nullable: false),
                    TotalExpected = table.Column<decimal>(type: "numeric(18,10)", precision: 18, scale: 10, nullable: false),
                    TotalDock = table.Column<decimal>(type: "numeric(18,10)", precision: 18, scale: 10, nullable: false),
                    TotalAvailable = table.Column<decimal>(type: "numeric(18,10)", precision: 18, scale: 10, nullable: false),
                    TotalAllocated = table.Column<decimal>(type: "numeric(18,10)", precision: 18, scale: 10, nullable: false),
                    TotalQuarantine = table.Column<decimal>(type: "numeric(18,10)", precision: 18, scale: 10, nullable: false),
                    Version = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_InventoryBalances", x => x.Id);
                    table.ForeignKey(
                        name: "FK_InventoryBalances_Companies_CompanyId",
                        column: x => x.CompanyId,
                        principalTable: "Companies",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_InventoryBalances_Customers_CustomerId",
                        column: x => x.CustomerId,
                        principalTable: "Customers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_InventoryBalances_Products_ProductId",
                        column: x => x.ProductId,
                        principalTable: "Products",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "ProductPackagings",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ProductId = table.Column<Guid>(type: "uuid", nullable: false),
                    PackagingTypeId = table.Column<Guid>(type: "uuid", nullable: false),
                    Barcode = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    ConversionFactor = table.Column<decimal>(type: "numeric(18,10)", precision: 18, scale: 10, nullable: false),
                    AllowFractionalPicking = table.Column<bool>(type: "boolean", nullable: false),
                    GrossWeight = table.Column<decimal>(type: "numeric(18,10)", precision: 18, scale: 10, nullable: false),
                    NetWeight = table.Column<decimal>(type: "numeric(18,10)", precision: 18, scale: 10, nullable: false),
                    LengthMm = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    WidthMm = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    HeightMm = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    MaxStacking = table.Column<int>(type: "integer", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ProductPackagings", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ProductPackagings_PackagingTypes_PackagingTypeId",
                        column: x => x.PackagingTypeId,
                        principalTable: "PackagingTypes",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ProductPackagings_Products_ProductId",
                        column: x => x.ProductId,
                        principalTable: "Products",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "CycleCountTasks",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CycleCountPlanId = table.Column<Guid>(type: "uuid", nullable: false),
                    LocationId = table.Column<Guid>(type: "uuid", nullable: false),
                    ProductId = table.Column<Guid>(type: "uuid", nullable: false),
                    AssignedUserId = table.Column<Guid>(type: "uuid", nullable: true),
                    ExpectedQuantity = table.Column<decimal>(type: "numeric(18,10)", precision: 18, scale: 10, nullable: false),
                    CountedQuantity = table.Column<decimal>(type: "numeric(18,10)", precision: 18, scale: 10, nullable: true),
                    CurrentRound = table.Column<int>(type: "integer", nullable: false),
                    IsDynamicStorage = table.Column<bool>(type: "boolean", nullable: false),
                    Status = table.Column<int>(type: "integer", nullable: false),
                    ScannedLpn = table.Column<string>(type: "text", nullable: true),
                    IsHuMismatch = table.Column<bool>(type: "boolean", nullable: false),
                    CountRound1 = table.Column<decimal>(type: "numeric(18,10)", precision: 18, scale: 10, nullable: true),
                    UserRound1 = table.Column<Guid>(type: "uuid", nullable: true),
                    CountRound2 = table.Column<decimal>(type: "numeric(18,10)", precision: 18, scale: 10, nullable: true),
                    UserRound2 = table.Column<Guid>(type: "uuid", nullable: true),
                    CountRound3 = table.Column<decimal>(type: "numeric(18,10)", precision: 18, scale: 10, nullable: true),
                    UserRound3 = table.Column<Guid>(type: "uuid", nullable: true),
                    AdjustmentType = table.Column<int>(type: "integer", nullable: false),
                    FiscalDocumentNumber = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    FiscalNotes = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CycleCountTasks", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CycleCountTasks_CycleCountPlans_CycleCountPlanId",
                        column: x => x.CycleCountPlanId,
                        principalTable: "CycleCountPlans",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_CycleCountTasks_Locations_LocationId",
                        column: x => x.LocationId,
                        principalTable: "Locations",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_CycleCountTasks_Products_ProductId",
                        column: x => x.ProductId,
                        principalTable: "Products",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "HandlingUnits",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Lpn = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    CompanyId = table.Column<Guid>(type: "uuid", nullable: false),
                    CustomerId = table.Column<Guid>(type: "uuid", nullable: false),
                    ProductId = table.Column<Guid>(type: "uuid", nullable: false),
                    PackagingTypeId = table.Column<Guid>(type: "uuid", nullable: false),
                    CurrentLocationId = table.Column<Guid>(type: "uuid", nullable: true),
                    ReceiptDocumentId = table.Column<Guid>(type: "uuid", nullable: true),
                    Batch = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    ManufactureDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    ExpirationDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    SerialNumber = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    InitialQuantity = table.Column<decimal>(type: "numeric(18,10)", precision: 18, scale: 10, nullable: false),
                    CurrentQuantity = table.Column<decimal>(type: "numeric(18,10)", precision: 18, scale: 10, nullable: false),
                    UnitValue = table.Column<decimal>(type: "numeric(18,10)", precision: 18, scale: 10, nullable: false),
                    Status = table.Column<int>(type: "integer", nullable: false),
                    QualityStatus = table.Column<int>(type: "integer", nullable: false),
                    Version = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_HandlingUnits", x => x.Id);
                    table.ForeignKey(
                        name: "FK_HandlingUnits_Companies_CompanyId",
                        column: x => x.CompanyId,
                        principalTable: "Companies",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_HandlingUnits_Customers_CustomerId",
                        column: x => x.CustomerId,
                        principalTable: "Customers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_HandlingUnits_Locations_CurrentLocationId",
                        column: x => x.CurrentLocationId,
                        principalTable: "Locations",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_HandlingUnits_PackagingTypes_PackagingTypeId",
                        column: x => x.PackagingTypeId,
                        principalTable: "PackagingTypes",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_HandlingUnits_Products_ProductId",
                        column: x => x.ProductId,
                        principalTable: "Products",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "InboundOrderItems",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    InboundOrderId = table.Column<Guid>(type: "uuid", nullable: false),
                    ProductId = table.Column<Guid>(type: "uuid", nullable: true),
                    LineNumber = table.Column<int>(type: "integer", nullable: false),
                    RawSkuCode = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    RawBarcode = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    RawDescription = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    RawNcm = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false),
                    RawCest = table.Column<string>(type: "text", nullable: true),
                    RawUnit = table.Column<string>(type: "text", nullable: false),
                    ExpectedQuantity = table.Column<decimal>(type: "numeric(28,10)", precision: 28, scale: 10, nullable: false),
                    ExpectedUnitValue = table.Column<decimal>(type: "numeric(28,10)", precision: 28, scale: 10, nullable: false),
                    ExpectedBatch = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    ExpectedManufactureDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    ExpectedExpirationDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    ReceivedQuantity = table.Column<decimal>(type: "numeric(28,10)", precision: 28, scale: 10, nullable: false),
                    Status = table.Column<int>(type: "integer", nullable: false),
                    LockedByUserId = table.Column<Guid>(type: "uuid", nullable: true),
                    LockedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    DockLocationId = table.Column<Guid>(type: "uuid", nullable: true),
                    Version = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_InboundOrderItems", x => x.Id);
                    table.ForeignKey(
                        name: "FK_InboundOrderItems_InboundOrders_InboundOrderId",
                        column: x => x.InboundOrderId,
                        principalTable: "InboundOrders",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_InboundOrderItems_Locations_DockLocationId",
                        column: x => x.DockLocationId,
                        principalTable: "Locations",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_InboundOrderItems_Products_ProductId",
                        column: x => x.ProductId,
                        principalTable: "Products",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "OutboundOrders",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CompanyId = table.Column<Guid>(type: "uuid", nullable: false),
                    CustomerId = table.Column<Guid>(type: "uuid", nullable: false),
                    OrderNumber = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    AccessKey = table.Column<string>(type: "character varying(44)", maxLength: 44, nullable: true),
                    RawXml = table.Column<string>(type: "text", nullable: true),
                    DestinationCnpjCpf = table.Column<string>(type: "character varying(14)", maxLength: 14, nullable: false),
                    DestinationName = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: false),
                    DestinationCity = table.Column<string>(type: "text", nullable: false),
                    DestinationState = table.Column<string>(type: "text", nullable: false),
                    DestinationZipCode = table.Column<string>(type: "text", nullable: true),
                    IssueDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    ExpectedShipDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    DockLocationId = table.Column<Guid>(type: "uuid", nullable: true),
                    Status = table.Column<int>(type: "integer", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_OutboundOrders", x => x.Id);
                    table.ForeignKey(
                        name: "FK_OutboundOrders_Companies_CompanyId",
                        column: x => x.CompanyId,
                        principalTable: "Companies",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_OutboundOrders_Customers_CustomerId",
                        column: x => x.CustomerId,
                        principalTable: "Customers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_OutboundOrders_Locations_DockLocationId",
                        column: x => x.DockLocationId,
                        principalTable: "Locations",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "QualityEvents",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CompanyId = table.Column<Guid>(type: "uuid", nullable: false),
                    HandlingUnitId = table.Column<Guid>(type: "uuid", nullable: false),
                    OriginalLocationId = table.Column<Guid>(type: "uuid", nullable: true),
                    HoldReasonId = table.Column<Guid>(type: "uuid", nullable: false),
                    HoldNotes = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: false),
                    ReleaseReasonId = table.Column<Guid>(type: "uuid", nullable: true),
                    ReleaseNotes = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    IsResolved = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_QualityEvents", x => x.Id);
                    table.ForeignKey(
                        name: "FK_QualityEvents_HandlingUnits_HandlingUnitId",
                        column: x => x.HandlingUnitId,
                        principalTable: "HandlingUnits",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_QualityEvents_Locations_OriginalLocationId",
                        column: x => x.OriginalLocationId,
                        principalTable: "Locations",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_QualityEvents_QualityReasons_HoldReasonId",
                        column: x => x.HoldReasonId,
                        principalTable: "QualityReasons",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_QualityEvents_QualityReasons_ReleaseReasonId",
                        column: x => x.ReleaseReasonId,
                        principalTable: "QualityReasons",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "OutboundFiscalDocuments",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    OutboundOrderId = table.Column<Guid>(type: "uuid", nullable: false),
                    Type = table.Column<int>(type: "integer", nullable: false),
                    Status = table.Column<int>(type: "integer", nullable: false),
                    AccessKey = table.Column<string>(type: "character varying(44)", maxLength: 44, nullable: true),
                    Protocol = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: true),
                    ReturnMessage = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    RawXml = table.Column<string>(type: "text", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_OutboundFiscalDocuments", x => x.Id);
                    table.ForeignKey(
                        name: "FK_OutboundFiscalDocuments_OutboundOrders_OutboundOrderId",
                        column: x => x.OutboundOrderId,
                        principalTable: "OutboundOrders",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "OutboundOrderItems",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    OutboundOrderId = table.Column<Guid>(type: "uuid", nullable: false),
                    ProductId = table.Column<Guid>(type: "uuid", nullable: false),
                    LineNumber = table.Column<int>(type: "integer", nullable: false),
                    SkuCode = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    ExpectedQuantity = table.Column<decimal>(type: "numeric(28,10)", precision: 28, scale: 10, nullable: false),
                    AllocatedQuantity = table.Column<decimal>(type: "numeric(28,10)", precision: 28, scale: 10, nullable: false),
                    PickedQuantity = table.Column<decimal>(type: "numeric(28,10)", precision: 28, scale: 10, nullable: false),
                    PackedQuantity = table.Column<decimal>(type: "numeric(28,10)", precision: 28, scale: 10, nullable: false),
                    UnitValue = table.Column<decimal>(type: "numeric(28,10)", precision: 28, scale: 10, nullable: false),
                    Status = table.Column<int>(type: "integer", nullable: false),
                    Version = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_OutboundOrderItems", x => x.Id);
                    table.ForeignKey(
                        name: "FK_OutboundOrderItems_OutboundOrders_OutboundOrderId",
                        column: x => x.OutboundOrderId,
                        principalTable: "OutboundOrders",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_OutboundOrderItems_Products_ProductId",
                        column: x => x.ProductId,
                        principalTable: "Products",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "OutboundVolume",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    OutboundOrderId = table.Column<Guid>(type: "uuid", nullable: false),
                    PackagingTypeId = table.Column<Guid>(type: "uuid", nullable: false),
                    VolumeLpn = table.Column<string>(type: "text", nullable: false),
                    GrossWeight = table.Column<decimal>(type: "numeric", nullable: false),
                    UsedStretchFilm = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_OutboundVolume", x => x.Id);
                    table.ForeignKey(
                        name: "FK_OutboundVolume_OutboundOrders_OutboundOrderId",
                        column: x => x.OutboundOrderId,
                        principalTable: "OutboundOrders",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_OutboundVolume_PackagingTypes_PackagingTypeId",
                        column: x => x.PackagingTypeId,
                        principalTable: "PackagingTypes",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "QualityEventImages",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    QualityEventId = table.Column<Guid>(type: "uuid", nullable: false),
                    FileName = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    FilePath = table.Column<string>(type: "text", nullable: false),
                    FileSizeBytes = table.Column<long>(type: "bigint", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_QualityEventImages", x => x.Id);
                    table.ForeignKey(
                        name: "FK_QualityEventImages_QualityEvents_QualityEventId",
                        column: x => x.QualityEventId,
                        principalTable: "QualityEvents",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "OutboundAllocations",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    OutboundOrderId = table.Column<Guid>(type: "uuid", nullable: false),
                    OutboundOrderItemId = table.Column<Guid>(type: "uuid", nullable: false),
                    HandlingUnitId = table.Column<Guid>(type: "uuid", nullable: false),
                    Quantity = table.Column<decimal>(type: "numeric(28,10)", precision: 28, scale: 10, nullable: false),
                    IsPicked = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_OutboundAllocations", x => x.Id);
                    table.ForeignKey(
                        name: "FK_OutboundAllocations_HandlingUnits_HandlingUnitId",
                        column: x => x.HandlingUnitId,
                        principalTable: "HandlingUnits",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_OutboundAllocations_OutboundOrderItems_OutboundOrderItemId",
                        column: x => x.OutboundOrderItemId,
                        principalTable: "OutboundOrderItems",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_OutboundAllocations_OutboundOrders_OutboundOrderId",
                        column: x => x.OutboundOrderId,
                        principalTable: "OutboundOrders",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_BillingCycles_CompanyId_CustomerId_ReferenceMonth",
                table: "BillingCycles",
                columns: new[] { "CompanyId", "CustomerId", "ReferenceMonth" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_BillingCycles_CustomerId",
                table: "BillingCycles",
                column: "CustomerId");

            migrationBuilder.CreateIndex(
                name: "IX_BillingItems_BillingCycleId",
                table: "BillingItems",
                column: "BillingCycleId");

            migrationBuilder.CreateIndex(
                name: "IX_BillingItems_BillingServiceId",
                table: "BillingItems",
                column: "BillingServiceId");

            migrationBuilder.CreateIndex(
                name: "IX_BillingServices_CompanyId_Name",
                table: "BillingServices",
                columns: new[] { "CompanyId", "Name" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Companies_Cnpj",
                table: "Companies",
                column: "Cnpj",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Customers_CompanyId_Cnpj",
                table: "Customers",
                columns: new[] { "CompanyId", "Cnpj" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_CustomerTariffs_BillingServiceId",
                table: "CustomerTariffs",
                column: "BillingServiceId");

            migrationBuilder.CreateIndex(
                name: "IX_CustomerTariffs_CustomerId",
                table: "CustomerTariffs",
                column: "CustomerId");

            migrationBuilder.CreateIndex(
                name: "IX_CycleCountTasks_CycleCountPlanId",
                table: "CycleCountTasks",
                column: "CycleCountPlanId");

            migrationBuilder.CreateIndex(
                name: "IX_CycleCountTasks_LocationId",
                table: "CycleCountTasks",
                column: "LocationId");

            migrationBuilder.CreateIndex(
                name: "IX_CycleCountTasks_ProductId",
                table: "CycleCountTasks",
                column: "ProductId");

            migrationBuilder.CreateIndex(
                name: "IX_FiscalOperationRules_CompanyId",
                table: "FiscalOperationRules",
                column: "CompanyId");

            migrationBuilder.CreateIndex(
                name: "IX_FiscalOperationRules_SpecificCustomerId",
                table: "FiscalOperationRules",
                column: "SpecificCustomerId");

            migrationBuilder.CreateIndex(
                name: "IX_HandlingUnits_CompanyId_Lpn",
                table: "HandlingUnits",
                columns: new[] { "CompanyId", "Lpn" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_HandlingUnits_CurrentLocationId",
                table: "HandlingUnits",
                column: "CurrentLocationId");

            migrationBuilder.CreateIndex(
                name: "IX_HandlingUnits_CustomerId",
                table: "HandlingUnits",
                column: "CustomerId");

            migrationBuilder.CreateIndex(
                name: "IX_HandlingUnits_PackagingTypeId",
                table: "HandlingUnits",
                column: "PackagingTypeId");

            migrationBuilder.CreateIndex(
                name: "IX_HandlingUnits_ProductId_Status_QualityStatus",
                table: "HandlingUnits",
                columns: new[] { "ProductId", "Status", "QualityStatus" });

            migrationBuilder.CreateIndex(
                name: "IX_InboundOrderItems_DockLocationId",
                table: "InboundOrderItems",
                column: "DockLocationId");

            migrationBuilder.CreateIndex(
                name: "IX_InboundOrderItems_InboundOrderId_Status",
                table: "InboundOrderItems",
                columns: new[] { "InboundOrderId", "Status" });

            migrationBuilder.CreateIndex(
                name: "IX_InboundOrderItems_ProductId",
                table: "InboundOrderItems",
                column: "ProductId");

            migrationBuilder.CreateIndex(
                name: "IX_InboundOrders_CompanyId_AccessKey",
                table: "InboundOrders",
                columns: new[] { "CompanyId", "AccessKey" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_InboundOrders_CustomerId",
                table: "InboundOrders",
                column: "CustomerId");

            migrationBuilder.CreateIndex(
                name: "IX_InventoryBalances_CompanyId_CustomerId_ProductId",
                table: "InventoryBalances",
                columns: new[] { "CompanyId", "CustomerId", "ProductId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_InventoryBalances_CustomerId",
                table: "InventoryBalances",
                column: "CustomerId");

            migrationBuilder.CreateIndex(
                name: "IX_InventoryBalances_ProductId",
                table: "InventoryBalances",
                column: "ProductId");

            migrationBuilder.CreateIndex(
                name: "IX_InventoryTransactions_CompanyId_CustomerId_Type_CreatedAt",
                table: "InventoryTransactions",
                columns: new[] { "CompanyId", "CustomerId", "Type", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_InventoryTransactions_ProductId_HandlingUnitId",
                table: "InventoryTransactions",
                columns: new[] { "ProductId", "HandlingUnitId" });

            migrationBuilder.CreateIndex(
                name: "IX_Locations_FullPath",
                table: "Locations",
                column: "FullPath",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Locations_StorageTypeId",
                table: "Locations",
                column: "StorageTypeId");

            migrationBuilder.CreateIndex(
                name: "IX_Locations_ZoneId",
                table: "Locations",
                column: "ZoneId");

            migrationBuilder.CreateIndex(
                name: "IX_OutboundAllocations_HandlingUnitId",
                table: "OutboundAllocations",
                column: "HandlingUnitId");

            migrationBuilder.CreateIndex(
                name: "IX_OutboundAllocations_OutboundOrderId",
                table: "OutboundAllocations",
                column: "OutboundOrderId");

            migrationBuilder.CreateIndex(
                name: "IX_OutboundAllocations_OutboundOrderItemId",
                table: "OutboundAllocations",
                column: "OutboundOrderItemId");

            migrationBuilder.CreateIndex(
                name: "IX_OutboundFiscalDocuments_AccessKey",
                table: "OutboundFiscalDocuments",
                column: "AccessKey");

            migrationBuilder.CreateIndex(
                name: "IX_OutboundFiscalDocuments_OutboundOrderId",
                table: "OutboundFiscalDocuments",
                column: "OutboundOrderId");

            migrationBuilder.CreateIndex(
                name: "IX_OutboundFiscalDocuments_Status",
                table: "OutboundFiscalDocuments",
                column: "Status");

            migrationBuilder.CreateIndex(
                name: "IX_OutboundOrderItems_OutboundOrderId",
                table: "OutboundOrderItems",
                column: "OutboundOrderId");

            migrationBuilder.CreateIndex(
                name: "IX_OutboundOrderItems_ProductId",
                table: "OutboundOrderItems",
                column: "ProductId");

            migrationBuilder.CreateIndex(
                name: "IX_OutboundOrders_CompanyId_OrderNumber",
                table: "OutboundOrders",
                columns: new[] { "CompanyId", "OrderNumber" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_OutboundOrders_CustomerId",
                table: "OutboundOrders",
                column: "CustomerId");

            migrationBuilder.CreateIndex(
                name: "IX_OutboundOrders_DockLocationId",
                table: "OutboundOrders",
                column: "DockLocationId");

            migrationBuilder.CreateIndex(
                name: "IX_OutboundVolume_OutboundOrderId",
                table: "OutboundVolume",
                column: "OutboundOrderId");

            migrationBuilder.CreateIndex(
                name: "IX_OutboundVolume_PackagingTypeId",
                table: "OutboundVolume",
                column: "PackagingTypeId");

            migrationBuilder.CreateIndex(
                name: "IX_PackagingTypes_CompanyId_Code",
                table: "PackagingTypes",
                columns: new[] { "CompanyId", "Code" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_PrintAgents_ApiKey",
                table: "PrintAgents",
                column: "ApiKey",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_PrintAgents_Name",
                table: "PrintAgents",
                column: "Name",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Printers_PrintAgentId",
                table: "Printers",
                column: "PrintAgentId");

            migrationBuilder.CreateIndex(
                name: "IX_ProductPackagings_Barcode",
                table: "ProductPackagings",
                column: "Barcode");

            migrationBuilder.CreateIndex(
                name: "IX_ProductPackagings_PackagingTypeId",
                table: "ProductPackagings",
                column: "PackagingTypeId");

            migrationBuilder.CreateIndex(
                name: "IX_ProductPackagings_ProductId_PackagingTypeId",
                table: "ProductPackagings",
                columns: new[] { "ProductId", "PackagingTypeId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Products_CompanyId_CustomerId_BaseBarcode",
                table: "Products",
                columns: new[] { "CompanyId", "CustomerId", "BaseBarcode" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Products_CompanyId_CustomerId_Sku",
                table: "Products",
                columns: new[] { "CompanyId", "CustomerId", "Sku" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Products_CustomerId",
                table: "Products",
                column: "CustomerId");

            migrationBuilder.CreateIndex(
                name: "IX_QualityEventImages_QualityEventId",
                table: "QualityEventImages",
                column: "QualityEventId");

            migrationBuilder.CreateIndex(
                name: "IX_QualityEvents_CompanyId_IsResolved",
                table: "QualityEvents",
                columns: new[] { "CompanyId", "IsResolved" });

            migrationBuilder.CreateIndex(
                name: "IX_QualityEvents_HandlingUnitId",
                table: "QualityEvents",
                column: "HandlingUnitId");

            migrationBuilder.CreateIndex(
                name: "IX_QualityEvents_HoldReasonId",
                table: "QualityEvents",
                column: "HoldReasonId");

            migrationBuilder.CreateIndex(
                name: "IX_QualityEvents_OriginalLocationId",
                table: "QualityEvents",
                column: "OriginalLocationId");

            migrationBuilder.CreateIndex(
                name: "IX_QualityEvents_ReleaseReasonId",
                table: "QualityEvents",
                column: "ReleaseReasonId");

            migrationBuilder.CreateIndex(
                name: "IX_QualityReasons_CompanyId_Code",
                table: "QualityReasons",
                columns: new[] { "CompanyId", "Code" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_RolePermissions_RoleId_Permission",
                table: "RolePermissions",
                columns: new[] { "RoleId", "Permission" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_StorageTypes_Name",
                table: "StorageTypes",
                column: "Name",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_UserCompanyRoles_CompanyId",
                table: "UserCompanyRoles",
                column: "CompanyId");

            migrationBuilder.CreateIndex(
                name: "IX_UserCompanyRoles_RoleId",
                table: "UserCompanyRoles",
                column: "RoleId");

            migrationBuilder.CreateIndex(
                name: "IX_UserCompanyRoles_UserId_CompanyId",
                table: "UserCompanyRoles",
                columns: new[] { "UserId", "CompanyId" });

            migrationBuilder.CreateIndex(
                name: "IX_UserCustomers_CustomerId",
                table: "UserCustomers",
                column: "CustomerId");

            migrationBuilder.CreateIndex(
                name: "IX_UserCustomers_UserId_CustomerId",
                table: "UserCustomers",
                columns: new[] { "UserId", "CustomerId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Users_Email",
                table: "Users",
                column: "Email",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Warehouses_Code",
                table: "Warehouses",
                column: "Code",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Zones_WarehouseId_Code",
                table: "Zones",
                columns: new[] { "WarehouseId", "Code" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "BillingItems");

            migrationBuilder.DropTable(
                name: "CustomerTariffs");

            migrationBuilder.DropTable(
                name: "CycleCountTasks");

            migrationBuilder.DropTable(
                name: "FiscalOperationRules");

            migrationBuilder.DropTable(
                name: "InboundOrderItems");

            migrationBuilder.DropTable(
                name: "InventoryBalances");

            migrationBuilder.DropTable(
                name: "InventoryTransactions");

            migrationBuilder.DropTable(
                name: "LabelTemplates");

            migrationBuilder.DropTable(
                name: "OutboundAllocations");

            migrationBuilder.DropTable(
                name: "OutboundFiscalDocuments");

            migrationBuilder.DropTable(
                name: "OutboundVolume");

            migrationBuilder.DropTable(
                name: "Printers");

            migrationBuilder.DropTable(
                name: "ProductPackagings");

            migrationBuilder.DropTable(
                name: "QualityEventImages");

            migrationBuilder.DropTable(
                name: "RolePermissions");

            migrationBuilder.DropTable(
                name: "UserCompanyRoles");

            migrationBuilder.DropTable(
                name: "UserCustomers");

            migrationBuilder.DropTable(
                name: "BillingCycles");

            migrationBuilder.DropTable(
                name: "BillingServices");

            migrationBuilder.DropTable(
                name: "CycleCountPlans");

            migrationBuilder.DropTable(
                name: "InboundOrders");

            migrationBuilder.DropTable(
                name: "OutboundOrderItems");

            migrationBuilder.DropTable(
                name: "PrintAgents");

            migrationBuilder.DropTable(
                name: "QualityEvents");

            migrationBuilder.DropTable(
                name: "Roles");

            migrationBuilder.DropTable(
                name: "Users");

            migrationBuilder.DropTable(
                name: "OutboundOrders");

            migrationBuilder.DropTable(
                name: "HandlingUnits");

            migrationBuilder.DropTable(
                name: "QualityReasons");

            migrationBuilder.DropTable(
                name: "Locations");

            migrationBuilder.DropTable(
                name: "PackagingTypes");

            migrationBuilder.DropTable(
                name: "Products");

            migrationBuilder.DropTable(
                name: "StorageTypes");

            migrationBuilder.DropTable(
                name: "Zones");

            migrationBuilder.DropTable(
                name: "Customers");

            migrationBuilder.DropTable(
                name: "Warehouses");

            migrationBuilder.DropTable(
                name: "Companies");
        }
    }
}
