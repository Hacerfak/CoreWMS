using System.Security.Cryptography;
using System.Text;

namespace CoreWMS.Api.Infrastructure.Security;

public static class CryptoService
{
    // Hashing da chave via SHA-256 garante que a chave do AES possua EXATAMENTE 32 bytes (256 bits)
    private static readonly byte[] Key = SHA256.HashData(Encoding.UTF8.GetBytes(
        Environment.GetEnvironmentVariable("CryptoSettings__Key")
        ?? "CoreWMS_AES_256_EncryptionKey_Default_Passphrase_32_Bytes"
    ));

    public static string Encrypt(string plainText)
    {
        if (string.IsNullOrEmpty(plainText)) return plainText;

        using var aes = Aes.Create();
        aes.Key = Key;
        aes.GenerateIV();

        using var encryptor = aes.CreateEncryptor(aes.Key, aes.IV);
        using var ms = new MemoryStream();
        ms.Write(aes.IV, 0, aes.IV.Length); // Salva o IV aleatório nos primeiros 16 bytes

        using (var cs = new CryptoStream(ms, encryptor, CryptoStreamMode.Write))
        using (var writer = new StreamWriter(cs))
        {
            writer.Write(plainText);
        }

        return Convert.ToBase64String(ms.ToArray());
    }

    public static string Decrypt(string cipherText)
    {
        if (string.IsNullOrEmpty(cipherText)) return cipherText;

        var fullCipher = Convert.FromBase64String(cipherText);
        using var aes = Aes.Create();
        aes.Key = Key;

        var iv = new byte[16];
        Array.Copy(fullCipher, 0, iv, 0, iv.Length);
        aes.IV = iv;

        using var decryptor = aes.CreateDecryptor(aes.Key, aes.IV);
        using var ms = new MemoryStream(fullCipher, 16, fullCipher.Length - 16);
        using var cs = new CryptoStream(ms, decryptor, CryptoStreamMode.Read);
        using var reader = new StreamReader(cs);

        return reader.ReadToEnd();
    }
}