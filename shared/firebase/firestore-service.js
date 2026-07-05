import { collection, onSnapshot, query } from "firebase/firestore";

function defaultMapper(snapshot) {
  return {
    id: snapshot.id,
    ...snapshot.data(),
  };
}

export function subscribeToLiveCollection(db, collectionName, options = {}) {
  const {
    constraints = [],
    mapDocument = defaultMapper,
    onData,
    onError,
  } = options;

  const collectionRef = collection(db, collectionName);
  const collectionQuery = constraints.length
    ? query(collectionRef, ...constraints)
    : collectionRef;

  return onSnapshot(
    collectionQuery,
    (snapshot) => {
      const documents = snapshot.docs.map(mapDocument);
      onData?.(documents, snapshot);
    },
    (error) => {
      onError?.(error);
    }
  );
}

export function subscribeToCourses(db, options = {}) {
  return subscribeToLiveCollection(db, "courses", options);
}
