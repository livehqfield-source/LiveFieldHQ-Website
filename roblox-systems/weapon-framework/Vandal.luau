--!nonstrict
--[[
	Vandal — assault rifle config

	Installed to: ReplicatedStorage.LiveFieldHQ_Weapons.Vandal

	Return a table (or a function returning a table) of weapon stats.
	Every field is optional; anything omitted falls back to the
	framework defaults in WeaponFramework.luau.
]]

local WeaponFramework = require(script.Parent:WaitForChild("WeaponFramework"))

return WeaponFramework.normalize({
	name = "Vandal",

	-- Damage: 40 to the body, 4x to the head.
	damage = 40,
	headshotMultiplier = 4,

	-- ~525 rounds per minute.
	fireInterval = 0.114,
	automatic = true,

	-- Ammo.
	magazineSize = 25,
	reserveAmmo = 75,
	reloadTime = 2.5,

	-- Range and accuracy.
	range = 1500,
	spread = 0.35,

	-- Damage stays high at range, then tapers off.
	falloffStart = 60,
	falloffEnd = 150,
	falloffMinMultiplier = 0.8,

	-- Recoil: noticeable vertical climb with mild horizontal sway.
	recoilVertical = 0.6,
	recoilHorizontal = 0.22,
	recoilRecovery = 5,

	-- Fill these in with your own animation asset ids to enable them.
	fireAnimationId = "",
	reloadAnimationId = "",
	equipAnimationId = "",
})
