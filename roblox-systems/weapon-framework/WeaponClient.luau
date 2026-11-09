--!nonstrict
--[[
	WeaponClient — LocalScript

	Installed to: StarterPlayer.StarterPlayerScripts.LiveFieldHQ_Weapons.WeaponClient

	Handles: equip, aiming, raycast shooting, recoil, ammo, reload and
	animation playback for every weapon configured under
	ReplicatedStorage.LiveFieldHQ_Weapons.

	Damage is decided on the server (WeaponServer). This client only reports
	where the shot came from, where it was aimed, and which weapon was fired.
]]

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local UserInputService = game:GetService("UserInputService")

local player = Players.LocalPlayer

local weaponsFolder = ReplicatedStorage:WaitForChild("LiveFieldHQ_Weapons")
local framework = require(weaponsFolder:WaitForChild("WeaponFramework"))
local fireEvent = weaponsFolder:WaitForChild("WeaponFire")
local reloadEvent = weaponsFolder:WaitForChild("WeaponReload")

local RECOIL_STEP = "LiveFieldHQRecoil"

local currentTool = nil
local config = nil
local state = nil
local lastShotAt = 0
local shotIndex = 0
local firing = false
local animations = {}
local recoilPitch = 0
local recoilYaw = 0

-- ---------------------------------------------------------------- helpers

local function resolveConfigName(toolName: string): string
	-- Tools are prefixed so "clear all" can find them; configs are not.
	return string.gsub(toolName, "^LiveFieldHQ_", "")
end

local function getTool()
	local character = player.Character
	if character then
		local tool = character:FindFirstChildOfClass("Tool")
		if tool then
			return tool
		end
	end
	local backpack = player:FindFirstChild("Backpack")
	if backpack then
		return backpack:FindFirstChildOfClass("Tool")
	end
	return nil
end

local function playAnimation(key)
	local animationId = config and config[key] or ""
	if animationId == "" then
		return
	end
	local animation = animations[key]
	if animation then
		animation:Play()
	end
end

local function loadAnimations(tool)
	table.clear(animations)
	local animator = tool:FindFirstChildOfClass("Animator")
	if animator == nil then
		local humanoid = player.Character and player.Character:FindFirstChildOfClass("Humanoid")
		animator = humanoid and humanoid:FindFirstChildOfClass("Animator")
	end
	if animator == nil then
		return
	end
	for _, child in ipairs(tool:GetChildren()) do
		if child:IsA("Animation") then
			local key = string.lower(child.Name)
			if key == "fire" or key == "shoot" then
				animations.fireAnimationId = animator:LoadAnimation(child)
			elseif key == "reload" then
				animations.reloadAnimationId = animator:LoadAnimation(child)
			elseif key == "equip" then
				animations.equipAnimationId = animator:LoadAnimation(child)
			end
		end
	end
end

-- ---------------------------------------------------------------- lifecycle

local function onEquipped(tool)
	currentTool = tool
	shotIndex = 0
	lastShotAt = 0
	recoilPitch = 0
	recoilYaw = 0

	local configModule = weaponsFolder:FindFirstChild(resolveConfigName(tool.Name))
	if configModule == nil then
		config = nil
		state = nil
		return
	end

	local ok, result = pcall(framework.load, configModule)
	if not ok then
		config = nil
		state = nil
		return
	end

	config = result
	state = {
		ammo = config.magazineSize,
		reserve = config.reserveAmmo,
		reloading = false,
	}

	loadAnimations(tool)
	playAnimation("equipAnimationId")
end

local function onUnequipped()
	currentTool = nil
	config = nil
	state = nil
	firing = false
end

local function trackCharacter(character)
	character.ChildAdded:Connect(function(child)
		if child:IsA("Tool") then
			onEquipped(child)
		end
	end)
	character.ChildRemoved:Connect(function(child)
		if child:IsA("Tool") and child == currentTool then
			onUnequipped()
		end
	end)
end

if player.Character then
	trackCharacter(player.Character)
end
player.CharacterAdded:Connect(trackCharacter)

-- ---------------------------------------------------------------- firing

local function startReload()
	if config == nil or state == nil then
		return
	end
	if not framework.canReload(config, state) then
		return
	end

	state.reloading = true
	playAnimation("reloadAnimationId")
	reloadEvent:FireServer(resolveConfigName(currentTool.Name))

	task.delay(config.reloadTime, function()
		if state ~= nil and state.reloading then
			framework.applyReload(config, state)
		end
	end)
end

local function fire()
	if config == nil or state == nil or state.reloading then
		return
	end
	if state.ammo <= 0 then
		startReload()
		return
	end

	local now = os.clock()
	if not framework.canFire(config, lastShotAt, now) then
		return
	end
	lastShotAt = now

	local camera = workspace.CurrentCamera
	if camera == nil then
		return
	end

	-- Aim from the camera through the crosshair, with the weapon's spread applied.
	local mouse = player:GetMouse()
	local target = mouse.Hit and mouse.Hit.Position
		or camera.CFrame.Position + camera.CFrame.LookVector * 100
	local direction = framework.applySpread((target - camera.CFrame.Position).Unit, config.spread)

	state.ammo -= 1
	shotIndex += 1

	local vertical, horizontal = framework.recoilFor(config, shotIndex - 1)
	recoilPitch += vertical
	recoilYaw += horizontal

	playAnimation("fireAnimationId")
	fireEvent:FireServer(resolveConfigName(currentTool.Name), camera.CFrame.Position, direction)

	if state.ammo <= 0 then
		startReload()
	end
end

UserInputService.InputBegan:Connect(function(input, gameProcessed)
	if gameProcessed then
		return
	end
	if input.UserInputType == Enum.UserInputType.MouseButton1 then
		firing = true
		fire()
	elseif input.UserInputType == Enum.UserInputType.Keyboard then
		if input.KeyCode == Enum.KeyCode.R then
			startReload()
		end
	end
end)

UserInputService.InputEnded:Connect(function(input)
	if input.UserInputType == Enum.UserInputType.MouseButton1 then
		firing = false
		shotIndex = 0
	end
end)

-- Automatic fire while the button is held.
task.spawn(function()
	while true do
		if firing and config and config.automatic then
			fire()
		end
		task.wait(0.03)
	end
end)

-- ---------------------------------------------------------------- recoil

RunService:BindToRenderStep(RECOIL_STEP, Enum.RenderPriority.Camera.Value + 1, function(dt)
	if recoilPitch == 0 and recoilYaw == 0 then
		return
	end
	local camera = workspace.CurrentCamera
	if camera == nil then
		return
	end

	camera.CFrame = camera.CFrame * CFrame.Angles(math.rad(recoilPitch), math.rad(recoilYaw), 0)

	local recovery = math.max(1 - (config and config.recoilRecovery or 6) * dt, 0)
	recoilPitch *= recovery
	recoilYaw *= recovery

	if math.abs(recoilPitch) < 0.001 then
		recoilPitch = 0
	end
	if math.abs(recoilYaw) < 0.001 then
		recoilYaw = 0
	end
end)
