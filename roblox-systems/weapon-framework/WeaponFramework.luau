--!nonstrict
--[[
	Modular Weapon Framework — shared module

	Installed to: ReplicatedStorage.LiveFieldHQ_Weapons.WeaponFramework

	Responsibilities:
	  * normalise weapon config against sane defaults
	  * damage maths: body damage + headshot multiplier + distance falloff
	  * recoil pattern generation
	  * ammo/reload helpers

	Client and server both require this module so the numbers always agree.
]]

local WeaponFramework = {}

local DEFAULTS = {
	name = "Unnamed Weapon",
	damage = 25,
	headshotMultiplier = 2,
	fireInterval = 0.12,        -- seconds between shots (automatic)
	magazineSize = 30,
	reserveAmmo = 120,
	reloadTime = 2.2,           -- seconds
	range = 1000,               -- studs the ray is traced
	spread = 0.3,               -- degrees of random cone
	automatic = true,
	-- damage falloff: full damage up to falloffStart, lerping to
	-- falloffMinMultiplier * damage at falloffEnd and beyond
	falloffStart = 40,
	falloffEnd = 120,
	falloffMinMultiplier = 0.6,
	-- recoil: vertical kick per shot, horizontal sway, and recovery speed
	recoilVertical = 0.55,
	recoilHorizontal = 0.2,
	recoilRecovery = 6,
	-- optional animation asset ids (empty string = no animation played)
	fireAnimationId = "",
	reloadAnimationId = "",
	equipAnimationId = "",
}

--- Returns a fully populated config table.
function WeaponFramework.normalize(config)
	assert(type(config) == "table", "WeaponFramework.normalize expects a table")

	local normalized = {}
	for key, default in pairs(DEFAULTS) do
		local value = config[key]
		normalized[key] = if value == nil then default else value
	end

	assert(type(normalized.name) == "string" and normalized.name ~= "", "weapon name is required")
	assert(type(normalized.damage) == "number" and normalized.damage > 0, "damage must be positive")
	assert(
		type(normalized.headshotMultiplier) == "number" and normalized.headshotMultiplier >= 1,
		"headshotMultiplier must be at least 1"
	)

	return normalized
end

--- Loads a weapon config module and normalises it.
function WeaponFramework.load(configModule)
	assert(type(configModule) == "Instance", "configModule must be an Instance")
	local raw = require(configModule)
	return WeaponFramework.normalize(if type(raw) == "function" then raw() else raw)
end

--- Damage for a shot at `distance` studs. Headshots multiply the falloff-adjusted value.
function WeaponFramework.damageFor(config, distance, isHeadshot)
	assert(type(config) == "table", "config must be a normalised weapon config")

	local damage = config.damage

	if type(distance) == "number" and distance > config.falloffStart then
		local span = math.max(config.falloffEnd - config.falloffStart, 1)
		local t = math.clamp((distance - config.falloffStart) / span, 0, 1)
		damage *= 1 - t * (1 - config.falloffMinMultiplier)
	end

	if isHeadshot then
		damage *= config.headshotMultiplier
	end

	return math.floor(damage + 0.5)
end

--- Recoil offsets for a given shot index (0-based), alternating horizontal sway.
function WeaponFramework.recoilFor(config, shotIndex)
	assert(type(config) == "table", "config must be a normalised weapon config")
	local index = math.max(shotIndex, 0)

	local vertical = config.recoilVertical * (1 + index * 0.06)
	local horizontal = config.recoilHorizontal * (if index % 2 == 0 then 1 else -1)

	return vertical, horizontal
end

--- Random spread direction, scaled by the weapon's spread (in degrees).
function WeaponFramework.applySpread(direction, spreadDegrees)
	assert(typeof(direction) == "Vector3", "direction must be a Vector3")
	local spread = math.rad(spreadDegrees or 0)
	if spread <= 0 then
		return direction.Unit
	end

	local angle = math.rad(math.random() * 360)
	local magnitude = math.tan(spread) * math.random()
	local offset = Vector3.new(math.cos(angle) * magnitude, math.sin(angle) * magnitude, 0)

	-- Build an orthonormal basis around the shot direction and offset within it.
	local up = if math.abs(direction.Y) > 0.99 then Vector3.new(1, 0, 0) else Vector3.new(0, 1, 0)
	local right = direction.Unit:Cross(up).Unit
	local trueUp = right:Cross(direction.Unit).Unit

	return (direction.Unit + right * offset.X + trueUp * offset.Y).Unit
end

--- Ticks reload completion. Returns false while still reloading.
function WeaponFramework.canReload(config, state)
	if state.reloading then
		return false
	end
	if state.ammo >= config.magazineSize then
		return false
	end
	return state.reserve > 0
end

--- Ammo after a reload completes (caller waits config.reloadTime first).
function WeaponFramework.applyReload(config, state)
	local needed = config.magazineSize - state.ammo
	local taken = math.min(needed, state.reserve)
	state.ammo += taken
	state.reserve -= taken
	state.reloading = false
	return state.ammo, state.reserve
end

--- Rate-limit helper: returns true if enough time has passed since the last shot.
function WeaponFramework.canFire(config, lastShotAt, now)
	local interval = math.max(config.fireInterval, 0.05)
	return lastShotAt == nil or (now - lastShotAt) >= interval
end

return WeaponFramework
