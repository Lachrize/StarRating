using MediaBrowser.Model.Plugins;

namespace Jellyfin.Plugin.StarRating.Configuration;

public class PluginConfiguration : BasePluginConfiguration
{
    public bool AllowSelfReview { get; set; } = true;

    public int MaxReviewLength { get; set; } = 2000;

    public bool ShowAverageOnPosters { get; set; } = true;

    public bool AllowedTypeMovie { get; set; } = true;

    public bool AllowedTypeSeries { get; set; } = true;
}
