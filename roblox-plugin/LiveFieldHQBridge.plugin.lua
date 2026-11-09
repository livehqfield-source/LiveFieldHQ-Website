--!nonstrict
--[[
	LiveFieldHQ Bridge — Roblox Studio plugin

	Polls the LiveFieldHQ backend for build commands and executes them in the
	open place. Everything the plugin creates lives under
	Workspace:FindFirstChild("LiveFieldHQ") (plus Lighting objects named
	"LiveFieldHQ_*") so "clear" never touches your own work.

	Setup: click the LiveFieldHQ toolbar button, paste your bridge token, Save.
]]

local HttpService = game:GetService("HttpService")
local Lighting = game:GetService("Lighting")
local Workspace = game:GetService("Workspace")

local TOOLBAR_NAME = "LiveFieldHQ"
local DEFAULT_URL = "http://127.0.0.1:4000"
local POLL_INTERVAL = 1
local FOLDER_NAME = "LiveFieldHQ"
local ASSETS_FOLDER_NAME = "Assets"

local SETTING_URL = "BaseUrl"
local SETTING_TOKEN = "Token"

print("[LiveFieldHQ] plugin loaded")

-- Roblox names the spherical part type "Ball", not "Sphere".
local PART_TYPE = {
	Block = Enum.PartType.Block,
	Sphere = Enum.PartType.Ball,
	Cylinder = Enum.PartType.Cylinder,
	Wedge = Enum.PartType.Wedge,
}

-- ---------------------------------------------------------------- utilities

local function safeSet(instance: any, property: string, value: any): boolean
	local ok = pcall(function()
		instance[property] = value
	end)
	return ok
end

local function parseVector3(text: string?): Vector3?
	if type(text) ~= "string" then return nil end
	local x, y, z = string.match(text, "^%s*(-?[%d%.]+)%s*,%s*(-?[%d%.]+)%s*,%s*(-?[%d%.]+)%s*$")
	if not x then return nil end
	return Vector3.new(tonumber(x), tonumber(y), tonumber(z))
end

local function parseColor(text: string?): Color3?
	if type(text) ~= "string" then return nil end
	local hex = string.match(text, "^#(%x%x%x%x%x%x)$")
	if not hex then return nil end
	local r = tonumber(string.sub(hex, 1, 2), 16)
	local g = tonumber(string.sub(hex, 3, 4), 16)
	local b = tonumber(string.sub(hex, 5, 6), 16)
	if not (r and g and b) then return nil end
	return Color3.fromRGB(r, g, b)
end

local function getBuildFolder(): Folder
	local existing = Workspace:FindFirstChild(FOLDER_NAME)
	if existing then return existing end
	local folder = Instance.new("Folder")
	folder.Name = FOLDER_NAME
	folder.Parent = Workspace
	return folder
end

-- Inserted assets live in their own subfolder so they stay separate from the
-- generated maps and props.
local function getAssetFolder(): Folder
	local root = getBuildFolder()
	local existing = root:FindFirstChild(ASSETS_FOLDER_NAME)
	if existing then return existing end
	local folder = Instance.new("Folder")
	folder.Name = ASSETS_FOLDER_NAME
	folder.Parent = root
	return folder
end

local function makePart(shape: string, size: Vector3, color: Color3, name: string, position: Vector3, parent: Instance): Part
	local part: Part
	if shape == "Wedge" then
		part = Instance.new("WedgePart")
	else
		part = Instance.new("Part")
		safeSet(part, "Shape", PART_TYPE[shape] or Enum.PartType.Block)
	end
	part.Name = name
	part.Size = size
	part.Color = color
	part.Anchored = true
	part.Position = position
	part.Parent = parent
	return part
end

-- ---------------------------------------------------------------- lighting

type LightingProps = {
	clockTime: number?,
	brightness: number?,
	ambient: string?,
	outdoorAmbient: string?,
	globalShadows: boolean?,
	fog: boolean?,
	atmosphere: any?,
}

local function applyAtmosphere(props: any)
	local atmo = Lighting:FindFirstChild("LiveFieldHQ_Atmosphere")
	if not props then
		if atmo then atmo:Destroy() end
		return
	end
	if not atmo then
		atmo = Instance.new("Atmosphere")
		atmo.Name = "LiveFieldHQ_Atmosphere"
		atmo.Parent = Lighting
	end
	safeSet(atmo, "Density", props.density or 0.3)
	safeSet(atmo, "Offset", props.offset or 0.5)
	if props.color then safeSet(atmo, "Color", props.color) end
	if props.decay then safeSet(atmo, "Decay", props.decay) end
	safeSet(atmo, "Glare", props.glare or 0)
	safeSet(atmo, "Haze", props.haze or 0)
end

local function applyLightingProps(props: LightingProps)
	if props.clockTime ~= nil then safeSet(Lighting, "ClockTime", props.clockTime) end
	if props.brightness ~= nil then safeSet(Lighting, "Brightness", props.brightness) end
	if props.ambient ~= nil then
		local color = parseColor(props.ambient)
		if color then safeSet(Lighting, "Ambient", color) end
	end
	if props.outdoorAmbient ~= nil then
		local color = parseColor(props.outdoorAmbient)
		if color then safeSet(Lighting, "OutdoorAmbient", color) end
	end
	if props.globalShadows ~= nil then safeSet(Lighting, "GlobalShadows", props.globalShadows) end
	if props.fog then
		safeSet(Lighting, "FogStart", 20)
		safeSet(Lighting, "FogEnd", 500)
	end
	applyAtmosphere(props.atmosphere)
end

local function resetLighting()
	safeSet(Lighting, "ClockTime", 14.5)
	safeSet(Lighting, "Brightness", 2)
	safeSet(Lighting, "Ambient", Color3.fromRGB(128, 128, 128))
	safeSet(Lighting, "OutdoorAmbient", Color3.fromRGB(128, 128, 128))
	safeSet(Lighting, "FogStart", 0)
	safeSet(Lighting, "FogEnd", 100000)
	local atmo = Lighting:FindFirstChild("LiveFieldHQ_Atmosphere")
	if atmo then atmo:Destroy() end
end

type SkyProps = {
	clockTime: number?,
	brightness: number?,
	ambient: string?,
	outdoorAmbient: string?,
	starCount: number?,
	sunSize: number?,
	moonSize: number?,
	atmosphere: any?,
}

local SKY_PRESETS: { [string]: SkyProps } = {
	default = {},
	day = {
		clockTime = 14.5,
		brightness = 3,
		ambient = "#bec3cd",
		outdoorAmbient = "#787d87",
		starCount = 0,
		sunSize = 12,
		moonSize = 8,
		atmosphere = {
			density = 0.25,
			offset = 0.5,
			color = Color3.fromRGB(190, 200, 220),
			decay = Color3.fromRGB(120, 140, 180),
			glare = 0.1,
			haze = 0.4,
		},
	},
	sunset = {
		clockTime = 18.4,
		brightness = 2.5,
		ambient = "#966e5a",
		outdoorAmbient = "#5a463c",
		starCount = 150,
		sunSize = 18,
		moonSize = 8,
		atmosphere = {
			density = 0.45,
			offset = 0.35,
			color = Color3.fromRGB(255, 170, 90),
			decay = Color3.fromRGB(120, 60, 90),
			glare = 0.6,
			haze = 1.2,
		},
	},
	night = {
		clockTime = 0,
		brightness = 1.2,
		ambient = "#3c4155",
		outdoorAmbient = "#232632",
		starCount = 3500,
		sunSize = 8,
		moonSize = 10,
		atmosphere = {
			density = 0.3,
			offset = 0.5,
			color = Color3.fromRGB(70, 80, 120),
			decay = Color3.fromRGB(30, 35, 60),
			glare = 0,
			haze = 0.8,
		},
	},
	space = {
		clockTime = 0,
		brightness = 0.6,
		ambient = "#191923",
		outdoorAmbient = "#0f0f16",
		starCount = 6000,
		sunSize = 0.5,
		moonSize = 0.5,
		atmosphere = false,
	},
	storm = {
		clockTime = 16.5,
		brightness = 1.6,
		ambient = "#50555f",
		outdoorAmbient = "#32373e",
		starCount = 0,
		sunSize = 10,
		moonSize = 8,
		atmosphere = {
			density = 0.7,
			offset = 0.4,
			color = Color3.fromRGB(90, 95, 105),
			decay = Color3.fromRGB(45, 50, 60),
			glare = 0.2,
			haze = 3.5,
		},
	},
	nebula = {
		clockTime = 0,
		brightness = 0.8,
		ambient = "#2d2346",
		outdoorAmbient = "#191228",
		starCount = 5000,
		sunSize = 6,
		moonSize = 6,
		atmosphere = {
			density = 0.55,
			offset = 0.4,
			color = Color3.fromRGB(140, 90, 200),
			decay = Color3.fromRGB(50, 25, 90),
			glare = 0.3,
			haze = 2.0,
		},
	},
}

local function applySky(presetName: string)
	local preset = SKY_PRESETS[presetName] or SKY_PRESETS.default

	local sky = Lighting:FindFirstChild("LiveFieldHQ_Sky")
	if not sky then
		sky = Instance.new("Sky")
		sky.Name = "LiveFieldHQ_Sky"
		sky.Parent = Lighting
	end
	if preset.starCount ~= nil then safeSet(sky, "StarCount", preset.starCount) end
	if preset.sunSize ~= nil then safeSet(sky, "SunAngularSize", preset.sunSize) end
	if preset.moonSize ~= nil then safeSet(sky, "MoonAngularSize", preset.moonSize) end

	applyLightingProps(preset)
	return string.format('Sky applied — preset "%s"', presetName)
end

-- ---------------------------------------------------------------- commands

local function applyPart(cmd: any): string
	local shape = cmd.shape or "Block"
	local size = parseVector3(cmd.size) or Vector3.new(4, 4, 4)
	local color = parseColor(cmd.color) or Color3.fromRGB(163, 162, 165)
	local position = parseVector3(cmd.position) or Vector3.new(0, size.Y / 2, 0)
	local anchored = cmd.anchored ~= false

	local part = makePart(shape, size, color, "LiveFieldHQ_" .. shape, position, getBuildFolder())
	part.Anchored = anchored

	return string.format("Part created — %s %s", shape, tostring(size))
end

local function applySpawn(cmd: any): string
	local position = parseVector3(cmd.position) or Vector3.new(0, 5, 0)
	local spawn = Instance.new("SpawnLocation")
	spawn.Name = "LiveFieldHQ_Spawn"
	spawn.Size = Vector3.new(6, 1, 6)
	spawn.Position = position
	spawn.Anchored = true
	spawn.Neutral = true
	spawn.Color = Color3.fromRGB(60, 200, 120)
	spawn.Material = Enum.Material.SmoothPlastic
	spawn.Parent = getBuildFolder()
	return string.format("Spawn point created at %s", tostring(position))
end

local function applyProp(cmd: any): string
	local kind = cmd.prop or "tree"
	local origin = parseVector3(cmd.position) or Vector3.new(0, 0, 0)
	local scale = tonumber(cmd.scale) or 1
	local folder = getBuildFolder()

	local model = Instance.new("Model")
	model.Name = "LiveFieldHQ_" .. kind

	if kind == "tree" then
		local trunk = makePart("Block", Vector3.new(1, 6, 1) * scale, Color3.fromRGB(101, 67, 33), "Trunk", Vector3.zero, model)
		makePart("Sphere", Vector3.new(5, 5, 5) * scale, Color3.fromRGB(34, 139, 34), "Leaves", Vector3.new(0, 5 * scale, 0), model)
		model.PrimaryPart = trunk
	elseif kind == "house" then
		local base = makePart("Block", Vector3.new(12, 1, 10) * scale, Color3.fromRGB(180, 150, 110), "Base", Vector3.new(0, 0.5 * scale, 0), model)
		local wallColor = Color3.fromRGB(210, 190, 160)
		local wallH = 4 * scale
		makePart("Block", Vector3.new(12, wallH, 1) * scale, wallColor, "WallN", Vector3.new(0, wallH / 2 + 1 * scale, -4.5 * scale), model)
		makePart("Block", Vector3.new(12, wallH, 1) * scale, wallColor, "WallS", Vector3.new(0, wallH / 2 + 1 * scale, 4.5 * scale), model)
		makePart("Block", Vector3.new(1, wallH, 10) * scale, wallColor, "WallE", Vector3.new(5.5 * scale, wallH / 2 + 1 * scale, 0), model)
		makePart("Block", Vector3.new(1, wallH, 10) * scale, wallColor, "WallW", Vector3.new(-5.5 * scale, wallH / 2 + 1 * scale, 0), model)
		makePart("Block", Vector3.new(13, 1, 11) * scale, Color3.fromRGB(140, 60, 50), "Roof", Vector3.new(0, wallH + 1.5 * scale, 0), model)
		model.PrimaryPart = base
	elseif kind == "tower" then
		local levels = 4
		local base = makePart("Block", Vector3.new(8, 2, 8) * scale, Color3.fromRGB(120, 120, 130), "Level0", Vector3.new(0, 1 * scale, 0), model)
		for i = 1, levels do
			local s = (8 - i) * scale
			makePart("Block", Vector3.new(s, 2, s), Color3.fromRGB(120 + i * 10, 120, 130), "Level" .. i, Vector3.new(0, (2 * i + 1) * scale, 0), model)
		end
		model.PrimaryPart = base
	elseif kind == "wall" then
		local wall = makePart("Block", Vector3.new(12, 5, 1) * scale, Color3.fromRGB(150, 150, 150), "Wall", Vector3.new(0, 2.5 * scale, 0), model)
		model.PrimaryPart = wall
	elseif kind == "platform" then
		local platform = makePart("Block", Vector3.new(16, 1, 16) * scale, Color3.fromRGB(90, 110, 140), "Platform", Vector3.new(0, 0.5 * scale, 0), model)
		model.PrimaryPart = platform
	elseif kind == "lamp" then
		local pole = makePart("Cylinder", Vector3.new(1, 8, 1) * scale, Color3.fromRGB(60, 60, 65), "Pole", Vector3.new(0, 4 * scale, 0), model)
		makePart("Sphere", Vector3.new(2, 2, 2) * scale, Color3.fromRGB(255, 220, 120), "Bulb", Vector3.new(0, 8.5 * scale, 0), model)
		local light = Instance.new("PointLight")
		light.Color = Color3.fromRGB(255, 220, 150)
		light.Range = 20 * scale
		light.Brightness = 2
		light.Parent = pole
		model.PrimaryPart = pole
	else
		model:Destroy()
		return "Unknown prop: " .. tostring(kind)
	end

	model.Parent = folder
	model:PivotTo(CFrame.new(origin))
	return string.format("Prop created — %s at %s", kind, tostring(origin))
end

-- ---------------------------------------------------------------- maps

local SPAWN_COLORS = {
	A = Color3.fromRGB(60, 130, 255),
	B = Color3.fromRGB(255, 90, 70),
}

local SPAWN_POSITIONS = {
	A = Vector3.new(-90, 0, 0),
	B = Vector3.new(90, 0, 0),
}

local function makeLabel(parent: Instance, text: string, color: Color3)
	local gui = Instance.new("BillboardGui")
	gui.Name = "Label"
	gui.Size = UDim2.fromOffset(240, 80)
	gui.StudsOffset = Vector3.new(0, 9, 0)
	gui.AlwaysOnTop = true
	gui.MaxDistance = 800
	gui.Parent = parent

	local label = Instance.new("TextLabel")
	label.BackgroundColor3 = Color3.fromRGB(12, 14, 20)
	label.BackgroundTransparency = 0.15
	label.BorderSizePixel = 0
	label.Size = UDim2.fromScale(1, 1)
	label.Text = text
	label.TextColor3 = color
	label.TextScaled = true
	label.Font = Enum.Font.GothamBold
	label.Parent = gui
end

local function buildWarmap(cmd: any): string
	local root = getBuildFolder()
	local folder = root:FindFirstChild("WarmupMap")
	if folder then
		folder:Destroy()
	end

	folder = Instance.new("Folder")
	folder.Name = "WarmupMap"
	folder.Parent = root

	local floorColor = Color3.fromRGB(45, 52, 62)
	local wallColor = Color3.fromRGB(35, 40, 50)
	local half = 120
	local wallHeight = 24
	local wallThickness = 2

	-- Floor, top surface at y = 0.
	makePart("Block", Vector3.new(half * 2, 2, half * 2), floorColor, "Floor", Vector3.new(0, -1, 0), folder)

	-- Perimeter walls.
	makePart("Block", Vector3.new(half * 2 + wallThickness * 2, wallHeight, wallThickness), wallColor, "WallNorth", Vector3.new(0, wallHeight / 2, -half - wallThickness / 2), folder)
	makePart("Block", Vector3.new(half * 2 + wallThickness * 2, wallHeight, wallThickness), wallColor, "WallSouth", Vector3.new(0, wallHeight / 2, half + wallThickness / 2), folder)
	makePart("Block", Vector3.new(wallThickness, wallHeight, half * 2 + wallThickness * 2), wallColor, "WallEast", Vector3.new(half + wallThickness / 2, wallHeight / 2, 0), folder)
	makePart("Block", Vector3.new(wallThickness, wallHeight, half * 2 + wallThickness * 2), wallColor, "WallWest", Vector3.new(-half - wallThickness / 2, wallHeight / 2, 0), folder)

	-- Cover blocks to practice around.
	local coverColor = Color3.fromRGB(90, 100, 115)
	local covers = {
		{ Vector3.new(10, 3, 10), Vector3.new(-30, 1.5, 0) },
		{ Vector3.new(10, 3, 10), Vector3.new(30, 1.5, 0) },
		{ Vector3.new(6, 5, 6), Vector3.new(0, 2.5, -40) },
		{ Vector3.new(6, 5, 6), Vector3.new(0, 2.5, 40) },
		{ Vector3.new(20, 2, 4), Vector3.new(0, 1, 0) },
	}
	for index, cover in ipairs(covers) do
		makePart("Block", cover[1], coverColor, "Cover" .. index, cover[2], folder)
	end

	-- Spawn pads: a coloured pad, a floating label and a real SpawnLocation.
	local ids = {}
	for _, spawn in ipairs(cmd.spawns or {}) do
		table.insert(ids, tostring(spawn.id))
	end
	if #ids == 0 then
		ids = { "A", "B" }
	end

	for _, id in ipairs(ids) do
		local position = SPAWN_POSITIONS[id]
		if position then
			local pad = makePart(
				"Block",
				Vector3.new(24, 1, 24),
				SPAWN_COLORS[id],
				"SpawnPad" .. id,
				Vector3.new(position.X, 0.5, position.Z),
				folder
			)
			makeLabel(pad, id .. " SPAWN", SPAWN_COLORS[id])

			local spawn = Instance.new("SpawnLocation")
			spawn.Name = "Spawn" .. id
			spawn.Size = Vector3.new(6, 1, 6)
			spawn.Position = Vector3.new(position.X, 1.5, position.Z)
			spawn.Anchored = true
			spawn.Neutral = true
			spawn.Color = SPAWN_COLORS[id]
			spawn.Material = Enum.Material.SmoothPlastic
			spawn.Parent = folder
		end
	end

	-- Read the map back so the transcript proves what actually landed.
	local function countDescendants(instance: Instance): number
		local count = 0
		for _, child in ipairs(instance:GetChildren()) do
			count += 1
			count += countDescendants(child)
		end
		return count
	end

	local expected = { "Floor", "WallNorth", "WallSouth", "WallEast", "WallWest" }
	for _, id in ipairs(ids) do
		table.insert(expected, "SpawnPad" .. id)
		table.insert(expected, "Spawn" .. id)
	end
	local verified = {}
	for _, name in ipairs(expected) do
		if folder:FindFirstChild(name) then
			table.insert(verified, name)
		end
	end

	return string.format(
		"Warm-up map built with %d spawn%s (%s) — %d/%d objects verified, %d parts in Workspace.LiveFieldHQ.WarmupMap",
		#ids,
		#ids == 1 and "" or "s",
		table.concat(ids, " and "),
		#verified,
		#expected,
		countDescendants(folder)
	)
end

local function applyMap(kind: string, cmd: any): string
	-- An arena uses the same layout as a warm-up map for now.
	if kind == "warmap" or kind == "arena" then
		return buildWarmap(cmd)
	end
	error("unknown map type: " .. kind)
end

-- ---------------------------------------------------------------- systems

local PREFIX = "LiveFieldHQ_"

local function resolveService(location: string): Instance
	if location == "StarterPlayerScripts" then
		local starterPlayer = game:GetService("StarterPlayer")
		local container = starterPlayer:FindFirstChild("StarterPlayerScripts")
		if container then
			return container
		end
		container = Instance.new("Folder")
		container.Name = "StarterPlayerScripts"
		container.Parent = starterPlayer
		return container
	end
	return game:GetService(location)
end

local function resolveFolder(service: Instance, folder: string?): Instance
	if not folder or folder == "" then
		return service
	end
	local existing = service:FindFirstChild(folder)
	if existing then
		return existing
	end
	local created = Instance.new("Folder")
	created.Name = folder
	created.Parent = service
	return created
end

local function removeWithPrefix(container: Instance)
	for _, child in ipairs(container:GetChildren()) do
		if string.sub(child.Name, 1, #PREFIX) == PREFIX then
			child:Destroy()
		end
	end
end

-- "Clear" must also remove installed systems, not just geometry.
local function clearServiceFolders()
	for _, name in ipairs({ "ReplicatedStorage", "ServerScriptService", "ServerStorage", "ReplicatedFirst", "StarterPack" }) do
		local ok, service = pcall(game.GetService, game, name)
		if ok and service then
			removeWithPrefix(service)
		end
	end
	local starterPlayer = game:GetService("StarterPlayer")
	if starterPlayer then
		local starterScripts = starterPlayer:FindFirstChild("StarterPlayerScripts")
		if starterScripts then
			removeWithPrefix(starterScripts)
		end
	end
end

-- Installs a system template: scripts and plain instances into the right
-- services. Existing instances with the same name are left alone.
local function applySystem(cmd: any): string
	local files = cmd.files
	if type(files) ~= "table" or #files == 0 then
		error("system has no files to install")
	end

	local installed = 0
	local skipped = 0
	local names = {}

	for _, file in ipairs(files) do
		local location = tostring(file.location or "ServerScriptService")
		local target = resolveFolder(resolveService(location), file.folder)

		if target:FindFirstChild(file.name) then
			skipped += 1
		else
			local instance = Instance.new(tostring(file.className or "Script"))
			instance.Name = tostring(file.name)

			if file.kind == "script" then
				safeSet(instance, "Source", tostring(file.source or ""))
			end

			if type(file.properties) == "table" then
				for key, value in pairs(file.properties) do
					safeSet(instance, key, value)
				end
			end

			instance.Parent = target

			-- A Tool needs a Handle before it can be equipped.
			if instance:IsA("Tool") and instance:FindFirstChildOfClass("Part") == nil then
				local handle = Instance.new("Part")
				handle.Name = "Handle"
				handle.Size = Vector3.new(1, 1, 4)
				handle.Parent = instance
			end

			installed += 1
		end

		table.insert(names, tostring(file.name))
	end

	-- Read the place back so the transcript proves what actually landed.
	local verified = 0
	for _, file in ipairs(files) do
		local target = resolveFolder(resolveService(tostring(file.location or "ServerScriptService")), file.folder)
		local instance = target:FindFirstChild(tostring(file.name))
		if instance and instance.ClassName == tostring(file.className or "Script") then
			verified += 1
		end
	end

	return string.format(
		"Installed %d file%s, %d already present, %d verified: %s",
		installed,
		installed == 1 and "" or "s",
		skipped,
		verified,
		table.concat(names, ", ")
	)
end

-- Inserts a linked Roblox asset (Creator Store / library id) into the place.
-- Everything lands under Workspace.LiveFieldHQ.Assets so "clear" still works.
local function applyAsset(cmd: any): string
	local assetId = tonumber(cmd.assetId)
	if type(assetId) ~= "number" or assetId <= 0 then
		error("asset is missing a valid id")
	end

	local insertService = game:GetService("InsertService")
	local ok, asset = pcall(function()
		return insertService:LoadAsset(assetId)
	end)

	if not ok or typeof(asset) ~= "Instance" then
		error(string.format("could not load asset %d - check it is free or owned and approved", assetId))
	end

	local folder = getAssetFolder()
	asset.Parent = folder

	if not asset:IsDescendantOf(folder) then
		error(string.format("asset %d loaded but nothing was inserted", assetId))
	end

	local label = tostring(cmd.name or asset.Name or ("Asset " .. assetId))
	return string.format("Inserted %s (asset %d)", label, assetId)
end

local function applyClear(target: string): string
	if target == "all" then
		local folder = Workspace:FindFirstChild(FOLDER_NAME)
		if folder then folder:Destroy() end
		local sky = Lighting:FindFirstChild("LiveFieldHQ_Sky")
		if sky then sky:Destroy() end
		resetLighting()
		clearServiceFolders()
		return "Cleared all LiveFieldHQ content"
	elseif target == "parts" then
		local folder = Workspace:FindFirstChild(FOLDER_NAME)
		if folder then folder:Destroy() end
		return "Cleared all built parts and props"
	elseif target == "sky" then
		local sky = Lighting:FindFirstChild("LiveFieldHQ_Sky")
		if sky then sky:Destroy() end
		return "Removed the sky"
	elseif target == "lighting" then
		resetLighting()
		return "Reset lighting to defaults"
	end
	return "Nothing to clear"
end

local function applyCommand(cmd: any): string
	if type(cmd) ~= "table" then
		error("command is missing")
	end

	local kind = cmd.type
	if kind == "sky" then
		return applySky(tostring(cmd.preset or "default"))
	elseif kind == "lighting" then
		applyLightingProps(cmd)
		return "Lighting updated"
	elseif kind == "part" then
		return applyPart(cmd)
	elseif kind == "spawn" then
		return applySpawn(cmd)
	elseif kind == "prop" then
		return applyProp(cmd)
	elseif kind == "clear" then
		return applyClear(tostring(cmd.target or "all"))
	elseif kind == "system" then
		return applySystem(cmd)
	elseif kind == "map" then
		return applyMap(tostring(cmd.map or "warmap"), cmd)
	elseif kind == "asset" then
		return applyAsset(cmd)
	end

	error("unknown command type: " .. tostring(kind))
end

-- ---------------------------------------------------------------- transport

local function request(options: { Url: string, Method: string?, Headers: any?, Body: string? })
	return HttpService:RequestAsync(options)
end

local function reportResult(jobId: string, ok: boolean, message: string)
	local token = plugin:GetSetting(SETTING_TOKEN) or ""
	local okCall, err = pcall(function()
		request({
			Url = (plugin:GetSetting(SETTING_URL) or DEFAULT_URL) .. "/api/roblox/jobs/" .. jobId .. "/result",
			Method = "POST",
			Headers = {
				["Content-Type"] = "application/json",
				["x-bridge-token"] = token,
			},
			Body = HttpService:JSONEncode({ ok = ok, message = message }),
		})
	end)
	if not okCall then
		warn("[LiveFieldHQ] failed to report result: " .. tostring(err))
	end
end

-- ---------------------------------------------------------------- gui state

local statusText = "Idle"
local lastResultText = "Nothing built yet."
local polling = false

local statusLabel: TextLabel? = nil
local resultLabel: TextLabel? = nil
local urlBox: TextBox? = nil
local tokenBox: TextBox? = nil

local function setStatus(text: string)
	statusText = text
	if statusLabel then statusLabel.Text = text end
end

local function setResult(text: string)
	lastResultText = text
	if resultLabel then resultLabel.Text = text end
end

-- ---------------------------------------------------------------- polling

local function currentPlaceId(): string?
	local ok, value = pcall(function()
		return game.PlaceId
	end)
	if ok and typeof(value) == "number" and value ~= 0 then
		return tostring(value)
	end
	return nil
end

local function currentPlaceName(): string?
	local ok, value = pcall(function()
		return game.Name
	end)
	if ok and type(value) == "string" and value ~= "" then
		return value
	end
	return nil
end

local function placeKey(value: string?): string?
	if type(value) ~= "string" or value == "" then
		return nil
	end
	local key = string.lower(value)
	key = string.gsub(key, "%.rbxlx$", "")
	key = string.gsub(key, "%.rbxl$", "")
	key = string.gsub(key, "[^%a%d]", "")
	return key ~= "" and key or nil
end

local function baseName(path: string?): string?
	if type(path) ~= "string" or path == "" then
		return nil
	end
	return string.match(path, "[^/\\]+$") or nil
end

-- The active project is enforced here: if Studio has a different place open,
-- the plugin refuses to build so commands only ever touch the active file.
local function isWrongPlace(active: any): boolean
	if type(active) ~= "table" then
		return false
	end

	local openId = currentPlaceId()
	if active.placeId and openId and tostring(active.placeId) ~= openId then
		return true
	end

	-- Fall back to matching names, since unpublished places have no place id.
	local openKey = placeKey(currentPlaceName())
	if not openKey then
		return false -- can't tell which place this is; don't block builds
	end

	for _, candidate in ipairs({ active.name, baseName(active.filePath) }) do
		if placeKey(candidate) == openKey then
			return false
		end
	end
	return true
end

local function pollOnce()
	local token = plugin:GetSetting(SETTING_TOKEN) or ""

	local ok, response = pcall(function()
		return request({
			Url = (plugin:GetSetting(SETTING_URL) or DEFAULT_URL) .. "/api/roblox/jobs",
			Method = "GET",
			Headers = {
				["x-bridge-token"] = token,
				["x-bridge-place-id"] = currentPlaceId() or "",
				["x-bridge-place-name"] = currentPlaceName() or "",
			},
		})
	end)

	if not ok or not response then
		setStatus("Connection failed — is the backend running?")
		return
	end

	if response.StatusCode == 401 then
		setStatus("Token rejected — re-check it and Save")
		return
	end

	if not response.Success then
		setStatus("HTTP error " .. tostring(response.StatusCode) .. " — check Allow HTTP Requests in Studio")
		return
	end

	setStatus("Connected — waiting for commands")

	local decoded = HttpService:JSONDecode(response.Body)
	local jobs = decoded and decoded.jobs
	if type(jobs) ~= "table" then return end

	if isWrongPlace(decoded.activeProject) then
		local name = tostring(decoded.activeProject and decoded.activeProject.name or "?")
		setStatus("Refusing — active project is \"" .. name .. "\"; open that place in Studio")
		for _, job in ipairs(jobs) do
			reportResult(tostring(job.id), false, "Wrong place open in Studio. Active project: " .. name)
		end
		return
	end

	for _, job in ipairs(jobs) do
		setStatus("Building: " .. tostring(job.text))
		local ran, result = pcall(applyCommand, job.command)
		if ran then
			setResult(tostring(result))
			reportResult(tostring(job.id), true, tostring(result))
		else
			setResult("Failed: " .. tostring(result))
			reportResult(tostring(job.id), false, tostring(result))
		end
	end
end

local function startPolling()
	if polling then return end
	polling = true
	task.spawn(function()
		while polling do
			pollOnce()
			task.wait(POLL_INTERVAL)
		end
	end)
end

local function stopPolling()
	polling = false
	setStatus("Stopped")
end

-- ---------------------------------------------------------------- gui build

local function makeLabel(text: string, size: number, bold: boolean?): TextLabel
	local label = Instance.new("TextLabel")
	label.BackgroundTransparency = 1
	label.Size = UDim2.new(1, -12, 0, size)
	label.Text = text
	label.TextColor3 = Color3.fromRGB(220, 220, 225)
	label.TextSize = 13
	label.Font = bold and Enum.Font.GothamBold or Enum.Font.Gotham
	label.TextXAlignment = Enum.TextXAlignment.Left
	label.TextWrapped = true
	return label
end

local function makeBox(placeholder: string, text: string): TextBox
	local box = Instance.new("TextBox")
	box.BackgroundColor3 = Color3.fromRGB(35, 38, 46)
	box.BorderSizePixel = 0
	box.Size = UDim2.new(1, -12, 0, 28)
	box.PlaceholderText = placeholder
	box.Text = text
	box.TextColor3 = Color3.fromRGB(230, 230, 235)
	box.TextSize = 13
	box.Font = Enum.Font.Gotham
	box.ClearTextOnFocus = false
	return box
end

local function makeButton(text: string, color: Color3): TextButton
	local button = Instance.new("TextButton")
	button.BackgroundColor3 = color
	button.BorderSizePixel = 0
	button.Size = UDim2.new(1, -12, 0, 30)
	button.Text = text
	button.TextColor3 = Color3.fromRGB(15, 15, 18)
	button.TextSize = 13
	button.Font = Enum.Font.GothamBold
	button.AutoButtonColor = true
	return button
end

local function buildPanel()
	local widget = plugin:CreateDockWidgetPluginGui("LiveFieldHQPanel", DockWidgetPluginGuiInfo.new(
		Enum.InitialDockState.Right,
		false,
		false,
		300,
		380,
		260,
		320,
		200,
		240
	))
	widget.Title = "LiveFieldHQ Bridge"
	widget.Enabled = false

	local panel = Instance.new("Frame")
	panel.BackgroundColor3 = Color3.fromRGB(24, 26, 32)
	panel.BorderSizePixel = 0
	panel.Size = UDim2.fromScale(1, 1)
	panel.Parent = widget

	local layout = Instance.new("UIListLayout")
	layout.Padding = UDim.new(0, 6)
	layout.SortOrder = Enum.SortOrder.LayoutOrder
	layout.Parent = panel

	local padding = Instance.new("UIPadding")
	padding.PaddingLeft = UDim.new(0, 6)
	padding.PaddingRight = UDim.new(0, 6)
	padding.PaddingTop = UDim.new(0, 8)
	padding.PaddingBottom = UDim.new(0, 8)
	padding.Parent = panel

	statusLabel = makeLabel("Idle", 26, true)
	statusLabel.LayoutOrder = 1
	statusLabel.Parent = panel

	urlBox = makeBox(DEFAULT_URL, plugin:GetSetting(SETTING_URL) or DEFAULT_URL)
	urlBox.LayoutOrder = 2
	urlBox.Parent = panel

	tokenBox = makeBox("bridge token", plugin:GetSetting(SETTING_TOKEN) or "")
	tokenBox.LayoutOrder = 3
	tokenBox.Parent = panel

	local saveButton = makeButton("Save settings", Color3.fromRGB(57, 255, 20))
	saveButton.LayoutOrder = 4
	saveButton.Parent = panel
	saveButton.MouseButton1Click:Connect(function()
		plugin:SetSetting(SETTING_URL, (urlBox and urlBox.Text ~= "" and urlBox.Text) or DEFAULT_URL)
		plugin:SetSetting(SETTING_TOKEN, tokenBox and tokenBox.Text or "")
		setStatus("Settings saved")
	end)

	local toggleButton = makeButton("Start listening", Color3.fromRGB(79, 140, 255))
	toggleButton.LayoutOrder = 5
	toggleButton.Parent = panel
	toggleButton.MouseButton1Click:Connect(function()
		if polling then
			stopPolling()
			toggleButton.Text = "Start listening"
		else
			startPolling()
			toggleButton.Text = "Stop listening"
		end
	end)

	resultLabel = makeLabel("Nothing built yet.", 42)
	resultLabel.LayoutOrder = 6
	resultLabel.Parent = panel

	local hint = makeLabel(
		"Commands come from the LiveFieldHQ Roblox Builder page. "
			.. "If requests fail, enable File > Experience Settings > Security > Allow HTTP Requests.",
		52
	)
	hint.TextColor3 = Color3.fromRGB(150, 155, 165)
	hint.LayoutOrder = 7
	hint.Parent = panel

	return widget
end

local widget = buildPanel()

local toolbar = plugin:CreateToolbar(TOOLBAR_NAME)
local toggle = toolbar:CreateButton("LiveFieldHQ", "Open the LiveFieldHQ bridge panel", "")
toggle.ClickableWhenViewportHidden = true
toggle.Click:Connect(function()
	widget.Enabled = not widget.Enabled
end)

setResult(lastResultText)
startPolling()
