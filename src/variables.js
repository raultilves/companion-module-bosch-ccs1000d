module.exports = function (self) {
	self.setVariableDefinitions([
		{ variableId: 'active_mic', name: 'Current active microphone' } // Numeric variable containing the ID of the currently active microphone, or 0 if no microphones are active
	])
}