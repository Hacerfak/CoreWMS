using Microsoft.Data.Sqlite;

namespace CoreWMS.PrintAgent.Storage;

public record PendingJob(string JobId, string PrinterName, string ZplContent, DateTime CreatedAt);

public class LocalQueueRepository
{
    private readonly string _connectionString = "Data Source=print_queue.db";

    public LocalQueueRepository()
    {
        using var connection = new SqliteConnection(_connectionString);
        connection.Open();
        var command = connection.CreateCommand();
        command.CommandText = @"
            CREATE TABLE IF NOT EXISTS PendingJobs (
                JobId TEXT PRIMARY KEY,
                PrinterName TEXT NOT NULL,
                ZplContent TEXT NOT NULL,
                CreatedAt TEXT NOT NULL
            );";
        command.ExecuteNonQuery();
    }

    public async Task SaveAsync(PendingJob job)
    {
        using var connection = new SqliteConnection(_connectionString);
        await connection.OpenAsync();
        var command = connection.CreateCommand();
        command.CommandText = @"
            INSERT OR REPLACE INTO PendingJobs (JobId, PrinterName, ZplContent, CreatedAt)
            VALUES ($id, $printer, $zpl, $created);";
        command.Parameters.AddWithValue("$id", job.JobId);
        command.Parameters.AddWithValue("$printer", job.PrinterName);
        command.Parameters.AddWithValue("$zpl", job.ZplContent);
        command.Parameters.AddWithValue("$created", job.CreatedAt.ToString("o"));
        await command.ExecuteNonQueryAsync();
    }

    public async Task<List<PendingJob>> GetPendingAsync()
    {
        var list = new List<PendingJob>();
        using var connection = new SqliteConnection(_connectionString);
        await connection.OpenAsync();
        var command = connection.CreateCommand();
        command.CommandText = "SELECT JobId, PrinterName, ZplContent, CreatedAt FROM PendingJobs ORDER BY CreatedAt ASC;";

        using var reader = await command.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            list.Add(new PendingJob(
                reader.GetString(0),
                reader.GetString(1),
                reader.GetString(2),
                DateTime.Parse(reader.GetString(3))
            ));
        }
        return list;
    }

    public async Task DeleteAsync(string jobId)
    {
        using var connection = new SqliteConnection(_connectionString);
        await connection.OpenAsync();
        var command = connection.CreateCommand();
        command.CommandText = "DELETE FROM PendingJobs WHERE JobId = $id;";
        command.Parameters.AddWithValue("$id", jobId);
        await command.ExecuteNonQueryAsync();
    }
}