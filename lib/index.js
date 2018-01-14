"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const functions = require("firebase-functions");
const admin = require("firebase-admin");
admin.initializeApp(functions.config().firebase);
// // Start writing Firebase Functions
// // https://firebase.google.com/functions/write-firebase-functions
//
exports.updateCurrentlyWaiting = functions.firestore
    .document('queues/{placeId}/items/{documentId}')
    .onWrite(event => {
    const placeId = event.params.placeId;
    const data = event.data.data();
    const placeDoc = admin.firestore().collection('places').doc(placeId);
    console.log('received a change in document. document status is ', data.status);
    if (data.status === 'waiting') {
        return placeDoc.get().then(document => {
            const place = document.data();
            place.currentlyWaiting = place.currentlyWaiting + 1;
            return place;
        })
            .then(updatedPlace => {
            getFrontOfLine(updatedPlace.lastCompletedSequence, placeId)
                .then(frontNumbers => {
                for (let i = 1; i <= frontNumbers.length; i++) {
                    updatedPlace['num' + i] = frontNumbers[i - 1];
                }
                return updatedPlace;
            })
                .then(place => {
                placeDoc.set(place)
                    .then(p => console.log('place updated', place))
                    .catch(reason => console.error('cannot update place', reason));
            })
                .catch(error => console.error('cannot get front of line', error));
        })
            .catch(reason => console.error(reason));
    }
    else if (data.status === 'ready') {
        return placeDoc.get().then(document => {
            const place = document.data();
            place.currentlyWaiting = place.currentlyWaiting - 1;
            if (place.currentlyWaiting < 0) {
                place.currentlyWaiting = 0;
            }
            if (place.lastCompletedSequence < data.queNumber) {
                place.lastCompletedSequence = data.queNumber;
            }
            return place;
        }).then(updatedPlace => {
            getFrontOfLine(updatedPlace.lastCompletedSequence, placeId)
                .then(frontNumbers => {
                for (let i = 1; i <= frontNumbers.length; i++) {
                    updatedPlace['num' + i] = frontNumbers[i - 1];
                }
                return updatedPlace;
            })
                .then(place => {
                placeDoc.set(place)
                    .then(p => console.log('place updated', place))
                    .catch(reason => console.error('cannot update place', reason));
            })
                .catch(error => console.error('cannot get front of line', error));
        })
            .catch(reason => console.error(reason));
    }
    else if (data.status === 'cancelled') {
        return placeDoc.get().then(document => {
            const place = document.data();
            place.currentlyWaiting = place.currentlyWaiting - 1;
            if (place.currentlyWaiting < 0) {
                place.currentlyWaiting = 0;
            }
            return place;
        }).then(updatedPlace => {
            getFrontOfLine(updatedPlace.lastCompletedSequence, placeId)
                .then(frontNumbers => {
                for (let i = 1; i <= frontNumbers.length; i++) {
                    updatedPlace['num' + i] = frontNumbers[i - 1];
                }
                return updatedPlace;
            })
                .then(place => {
                placeDoc.set(place)
                    .then(p => console.log('place updated', place))
                    .catch(reason => console.error('cannot update place', reason));
            })
                .catch(error => console.error('cannot get front of line', error));
        })
            .catch(reason => console.error(reason));
    }
    return null;
});
exports.sendNotificationOnReady = functions.firestore
    .document('queues/{placeId}/items/{userId}')
    .onUpdate(event => {
    const userId = event.params.userId;
    const placeId = event.params.placeId;
    const data = event.data.data();
    const previousData = event.data.previous.data();
    const userDocRef = admin.firestore().collection('users').doc(userId);
    if (data.reminderCounter > previousData.reminderCounter) {
        console.info('remind queue again.');
        const payload = generateNotificationPayload(placeId);
        payload.data.title = `Reminder about your reservation at ${data.placeName}`;
        payload.data.description = 'Please arrive in 5 minutes.';
        return sendPush(userDocRef, payload);
    }
    if (data.status === 'ready') {
        const payload = generateNotificationPayload(placeId);
        payload.data.title = `Your turn as arrived at ${data.placeName}`;
        payload.data.description = 'Please arrive in 5 minutes';
        return sendPush(userDocRef, payload);
    }
    else if (data.status === 'cancelled') {
        const payload = generateNotificationPayload(placeId);
        payload.data.title = `Your queue at ${data.placeName} has been cancelled.`;
        payload.data.description = 'Plase queue up again.';
        return sendPush(userDocRef, payload);
    }
    return null;
});
function sendPush(userDocRef, payload) {
    return userDocRef.get()
        .then(userDoc => {
        return userDoc.data().deviceToken;
    })
        .then(deviceToken => {
        console.info('sending push notification');
        admin.messaging().sendToDevice(deviceToken, payload)
            .then(result => {
            console.log('push success', result);
        })
            .catch(err => console.error("error send push notification", err));
        ;
    })
        .catch(err => {
        console.error('sendNotificationOnReady', err);
    });
}
function generateNotificationPayload(placeId) {
    return {
        data: {
            title: '',
            placeId: placeId,
            description: ''
        }
    };
}
function getFrontOfLine(lastCompletedSequence, placeId) {
    const queueCollectionRef = admin.firestore().collection('queues')
        .doc(placeId)
        .collection('items');
    const query = queueCollectionRef
        .where('queNumber', '>', lastCompletedSequence)
        .where('status', '==', 'waiting')
        .orderBy('queNumber')
        .limit(3);
    return new Promise((resolve, reject) => {
        const numbers = [];
        query.get().then(querySnapshot => {
            querySnapshot.forEach(doc => numbers.push(doc.data().queNumber));
            for (let i = 0; i < (3 - numbers.length); i++) {
                console.log('looping at index ', i);
                numbers.push(0);
            }
            console.info('front of line is', numbers);
            resolve(numbers);
        })
            .catch(error => {
            reject(error);
        });
    });
}
//# sourceMappingURL=index.js.map