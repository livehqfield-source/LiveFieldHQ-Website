--!nonstrict
--[[
	WeaponServer — Script

	Installed to: ServerScriptService.LiveFieldHQ_Weapons.WeaponServer

	Owns the authority: validates incoming shots, performs its own raycast,
	and applies damage using the shared framework (headshot multiplier and
	distance falloff).

	The client sends (weaponName, origin, direction). It never sends the hit
	result, so the server decides what was actually hit.
]]

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local ServerScriptService = game:GetService("ServerScriptService")

local weaponsFolder = ReplicatedStorage:WaitForChild("LiveFieldHQ_Weapons")
local framework = require(weaponsFolder:WaitForChild("WeaponFramework"))

-- Remotes live next to the configs so both sides agree on the location.
local fireEvent = Instance.new("RemoteEvent")
fireEvent.Name = "WeaponFire"
fireEvent.Parent = weaponsFolder

local reloadEvent = Instance.new("RemoteEvent")
reloadEvent.Name = "WeaponReload"
reloadEvent.Parent = weaponsFolder

local MIN_SHOT_INTERVAL = 0.05        -- seconds, hard anti-cheat floor
local MAX_ORIGIN_DISTANCE = 500       -- studs from character to claimed origin

local lastShotAt = {}
local shotCounts = {}

local function loadConfig(weaponName)
	local module = weaponsFolder:FindFirstChild(string.gsub(weaponName, "^LiveFieldHQ_", ""))
	if module == nil then
		return nil
	end
	local ok, result = pcall(framework.load, module)
	if not ok then
		return nil
	end
	return result
end

local function isHeadPart(part)
	local name = string.lower(part.Name)
	return name == "head" or name == "headmesh" or name:find("head") ~= nil
end

local function applyDamage(player, weaponName, origin, direction)
	local config = loadConfig(weaponName)
	if config == nil then
		return
	end

	if typeof(origin) ~= "Vector3" or typeof(direction) ~= "Vector3" then
		return
	end
	local magnitude = direction.Magnitude
	if magnitude < 0.9 or magnitude > 1.1 then
		return
	end

	local character = player.Character
	if character == nil then
		return
	end
	local root = character:FindFirstChild("HumanoidRootPart")
	if root == nil then
		return
	end
	if (root.Position - origin).Magnitude > MAX_ORIGIN_DISTANCE then
		return
	end

	-- Rate limit per player.
	local now = os.clock()
	local last = lastShotAt[player]
	if last ~= nil and now - last < math.max(config.fireInterval, MIN_SHOT_INTERVAL) then
		return
	end
	lastShotAt[player] = now

	shotCounts[player] = (shotCounts[player] or 0) + 1

	local params = RaycastParams.new()
	params.FilterDescendantsInstances = { character }
	params.FilterType = Enum.RaycastFilterType.Exclude
	params.IgnoreWater = true

	local result = workspace:Raycast(origin, direction.Unit * config.range, params)
	if result == nil then
		return
	end

	local hitPart = result.Instance
	if hitPart == nil then
		return
	end

	local hitModel = hitPart:FindFirstAncestorOfClass("Model")
	if hitModel == nil then
		return
	end

	local hitPlayer = Players:GetPlayerFromCharacter(hitModel)
	if hitPlayer == nil or hitPlayer == player then
		return
	end

	local humanoid = hitModel:FindFirstChildOfClass("Humanoid")
	if humanoid == nil or humanoid.Health <= 0 then
		return
	end

	local damage = framework.damageFor(config, result.Distance, isHeadPart(hitPart))
	humanoid:TakeDamage(damage)
end

fireEvent.OnServerEvent:Connect(function(player, weaponName, origin, direction)
	local ok, err = pcall(applyDamage, player, weaponName, origin, direction)
	if not ok then
		warn("[LiveFieldHQ] weapon shot failed: " .. tostring(err))
	end
end)

reloadEvent.OnServerEvent:Connect(function(player, weaponName)
	-- Ammo is tracked client-side; the server only acknowledges the reload so
	-- you can hook server-side logic (e.g. reload-blocks-shooting) here later.
end)

Players.PlayerRemoving:Connect(function(player)
	lastShotAt[player] = nil
	shotCounts[player] = nil
end)
