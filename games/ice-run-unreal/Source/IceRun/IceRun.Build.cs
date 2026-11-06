using UnrealBuildTool;

public class IceRun : ModuleRules
{
	public IceRun(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;
		PublicDependencyModuleNames.AddRange(new string[]
		{
			"Core",
			"CoreUObject",
			"Engine",
			"InputCore",
			"Json",
			"ProceduralMeshComponent",
			"Slate",
			"SlateCore",
		});
	}
}
