using System;
using System.Collections.Generic;
using Jellyfin.Plugin.StarRating.Configuration;
using MediaBrowser.Common.Configuration;
using MediaBrowser.Common.Plugins;
using MediaBrowser.Model.Plugins;
using MediaBrowser.Model.Serialization;

namespace Jellyfin.Plugin.StarRating;

public class Plugin : BasePlugin<PluginConfiguration>, IHasWebPages
{
    public Plugin(IApplicationPaths applicationPaths, IXmlSerializer xmlSerializer)
        : base(applicationPaths, xmlSerializer)
    {
        Instance = this;
    }

    public override string Name => "StarRating";

    public override Guid Id => Guid.Parse("a4df60c5-6b46-4ce4-b6b7-d95a75b25c9e");

    public override string Description => "Notez et commentez vos médias";

    public static Plugin? Instance { get; private set; }

    public IEnumerable<PluginPageInfo> GetPages()
    {
        return
        [
            new PluginPageInfo
            {
                Name = "starrating",
                EmbeddedResourcePath = $"{GetType().Namespace}.Web.config.html"
            }
        ];
    }
}
