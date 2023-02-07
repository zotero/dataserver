<?php
//
// Check for existing groups, make sure they have the right permissions,
// and delete any others
//
require_once __DIR__ . '/api3.inc.php';

$resetGroups = false;

$response = API3::superGet(
	"users/" . $config['userID'] . "/groups"
);
$groups = API3::getJSONFromResponse($response);
$config['ownedPublicGroupID'] = null;
$config['ownedPublicNoAnonymousGroupID'] = null;
$config['ownedPrivateGroupID'] = null;
$config['ownedPrivateGroupName'] = 'Private Test Group';
$config['ownedPrivateGroupID2'] = null;
$toDelete = [];
foreach ($groups as $group) {
	$data = $group['data'];
	$id = $data['id'];
	$type = $data['type'];
	$owner = $data['owner'];
	$libraryReading = $data['libraryReading'];
	
	if ($resetGroups) {
		$toDelete[] = $id;
		continue;
	}
	
	if (!$config['ownedPublicGroupID']
			&& $type == 'PublicOpen'
			&& $owner == $config['userID']
			&& $libraryReading == 'all') {
		$config['ownedPublicGroupID'] = $id;
	}
	else if (!$config['ownedPublicNoAnonymousGroupID']
			&& $type == 'PublicClosed'
			&& $owner == $config['userID']
			&& $libraryReading == 'members') {
		$config['ownedPublicNoAnonymousGroupID'] = $id;
	}
	else if ($type == 'Private' && $owner == $config['userID'] && $data['name'] == $config['ownedPrivateGroupName']) {
		$config['ownedPrivateGroupID'] = $id;
	}
	else if ($type == 'Private' && $owner == $config['userID2']) {
		$config['ownedPrivateGroupID2'] = $id;
	}
	else {
		$toDelete[] = $id;
	}
}

if (!$config['ownedPublicGroupID']) {
	$config['ownedPublicGroupID'] = API3::createGroup([
		'owner' => $config['userID'],
		'type' => 'PublicOpen',
		'libraryReading' => 'all'
	]);
}
if (!$config['ownedPublicNoAnonymousGroupID']) {
	$config['ownedPublicNoAnonymousGroupID'] = API3::createGroup([
		'owner' => $config['userID'],
		'type' => 'PublicClosed',
		'libraryReading' => 'members'
	]);
}
if (!$config['ownedPrivateGroupID']) {
	$config['ownedPrivateGroupID'] = API3::createGroup([
		'owner' => $config['userID'],
		'name' => "Private Test Group",
		'type' => 'Private',
		'libraryReading' => 'members',
		'fileEditing' => 'members',
		'members' => [
			$config['userID2']
		]
	]);
}
if (!$config['ownedPrivateGroupID2']) {
	$config['ownedPrivateGroupID2'] = API3::createGroup([
		'owner' => $config['userID2'],
		'type' => 'Private',
		'libraryReading' => 'members',
		'fileEditing' => 'members'
	]);
}
foreach ($toDelete as $groupID) {
	API3::deleteGroup($groupID);
}

$config['numOwnedGroups'] = 3;
$config['numPublicGroups'] = 2;

foreach ($groups as $group) {
	if (!in_array($group['id'], $toDelete)) {
		API3::groupClear($group['id']);
	}
}

\Zotero\Tests\Config::update($config);

unset($response);
unset($groups);
unset($toDelete);
