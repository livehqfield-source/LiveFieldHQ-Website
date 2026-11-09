local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local ScreenGui = Instance.new("ScreenGui")
local Frame = Instance.new("Frame")
local TextLabel = Instance.new("TextLabel")
local PlayButton = Instance.new("TextButton")

ScreenGui.Parent = game.Players.LocalPlayer.PlayerGui
Frame.Parent = ScreenGui
Frame.Size = UDim2.new(0.5, 0, 0.5, 0)
Frame.Position = UDim2.new(0.25, 0, 0.25, 0)
Frame.BackgroundColor3 = Color3.new(0.1, 0.1, 0.1)

TextLabel.Parent = Frame
TextLabel.Size = UDim2.new(1, 0, 0.3, 0)
TextLabel.Position = UDim2.new(0, 0, 0, 0)
TextLabel.BackgroundColor3 = Color3.new(0.2, 0.2, 0.2)
TextLabel.Text = "Welcome to the Lobby"
TextLabel.TextColor3 = Color3.new(1, 1, 1)
TextLabel.Font = Enum.Font.SourceSans

PlayButton.Parent = Frame
PlayButton.Size = UDim2.new(1, 0, 0.3, 0)
PlayButton.Position = UDim2.new(0, 0, 0.4, 0)
PlayButton.BackgroundColor3 = Color3.new(0.3, 0.6, 1)
PlayButton.Text = "Play"
PlayButton.TextColor3 = Color3.new(0, 0, 0)

PlayButton.MouseButton1Click:Connect(function()
    -- Placeholder for play logic
    print("Play button clicked")
end)