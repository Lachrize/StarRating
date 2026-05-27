using System;
using System.Collections.Generic;
using System.IO;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.StarRating.Services;

public partial class WebAssetInjectionService : IHostedService
{
    private const string StartMarker = "<!-- StarRating plugin assets start -->";
    private const string EndMarker = "<!-- StarRating plugin assets end -->";
    private const string AssetVersion = "20260527-1";
    private readonly ILogger<WebAssetInjectionService> _logger;

    public WebAssetInjectionService(ILogger<WebAssetInjectionService> logger)
    {
        _logger = logger;
    }

    public Task StartAsync(CancellationToken cancellationToken)
    {
        try
        {
            InjectAssets();
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Unable to inject StarRating web assets into Jellyfin Web.");
        }

        return Task.CompletedTask;
    }

    public Task StopAsync(CancellationToken cancellationToken)
    {
        try
        {
            RemoveAssets();
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Unable to clean StarRating web assets from Jellyfin Web.");
        }

        return Task.CompletedTask;
    }

    private void RemoveAssets()
    {
        var indexPath = FindJellyfinWebIndex();
        if (indexPath is null) return;

        var html = File.ReadAllText(indexPath);
        var cleaned = AssetBlockRegex().Replace(html, string.Empty);
        if (string.Equals(html, cleaned, StringComparison.Ordinal)) return;

        File.WriteAllText(indexPath, cleaned);
        _logger.LogInformation("StarRating web assets removed from {IndexPath}.", indexPath);
    }

    private void InjectAssets()
    {
        var indexPath = FindJellyfinWebIndex();
        if (indexPath is null)
        {
            _logger.LogWarning("Jellyfin Web index.html was not found. StarRating server plugin is installed, but the web UI cannot be auto-loaded.");
            return;
        }

        var html = File.ReadAllText(indexPath);
        var cleaned = AssetBlockRegex().Replace(html, string.Empty);
        var block = Environment.NewLine +
            StartMarker + Environment.NewLine +
            $"<link rel=\"stylesheet\" href=\"/StarRating/web/starrating.css?v={AssetVersion}\">" + Environment.NewLine +
            $"<script defer src=\"/StarRating/web/starrating.js?v={AssetVersion}\"></script>" + Environment.NewLine +
            EndMarker + Environment.NewLine;

        string updated;
        if (cleaned.Contains("</head>", StringComparison.OrdinalIgnoreCase))
        {
            updated = Regex.Replace(cleaned, "</head>", block + "</head>", RegexOptions.IgnoreCase);
        }
        else if (cleaned.Contains("</body>", StringComparison.OrdinalIgnoreCase))
        {
            updated = Regex.Replace(cleaned, "</body>", block + "</body>", RegexOptions.IgnoreCase);
        }
        else
        {
            updated = cleaned + block;
        }

        if (string.Equals(html, updated, StringComparison.Ordinal))
        {
            return;
        }

        File.WriteAllText(indexPath, updated);
        _logger.LogInformation("StarRating web assets injected into {IndexPath}.", indexPath);
    }

    private static string? FindJellyfinWebIndex()
    {
        foreach (var candidate in CandidateIndexPaths())
        {
            try
            {
                if (File.Exists(candidate))
                {
                    return candidate;
                }
            }
            catch
            {
                // Ignore inaccessible candidates and continue with the next known layout.
            }
        }

        return null;
    }

    private static IEnumerable<string> CandidateIndexPaths()
    {
        var baseDir = AppContext.BaseDirectory;

        yield return Path.Combine(baseDir, "jellyfin-web", "index.html");
        yield return Path.Combine(baseDir, "web", "index.html");
        yield return Path.GetFullPath(Path.Combine(baseDir, "..", "Resources", "jellyfin-web", "index.html"));
        yield return "/usr/share/jellyfin/web/index.html";
        yield return "/usr/share/jellyfin-web/index.html";
        yield return "/jellyfin/jellyfin-web/index.html";
    }

    [GeneratedRegex(@"<!-- StarRating plugin assets start -->.*?<!-- StarRating plugin assets end -->\s*", RegexOptions.Singleline)]
    private static partial Regex AssetBlockRegex();
}
