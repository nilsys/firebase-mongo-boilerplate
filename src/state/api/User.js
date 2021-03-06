/**
 * API requests to firebase and mongo that affect the user objects in our Context state.
 *  {@link createUser} and {@link signInUser} are the main functions used for user signUp/signIn
 * @module User
 * @category API
 */

import axios from 'axios'
import React from 'react'
import firebase from 'firebase/app'
import { auth, googleProvider, facebookProvider } from '../../config/firebase'
import { createNotification } from '../../utils/Messages'
import { actionTypes } from '../constants'

/**
 *
 * Function used to sign in using Firebase Google provider.
 * @param {Object} state Context state
 * @param {Function} dispatch dispatch function returned by useReducer hook
 * @param {Function} cb This is a callback to which firebase user object is passed. Null is passed if anything fails.
 * @function signInWithGoogle
 */
export const signInWithGoogle = (state, dispatch, cb) => {
  try {
    auth
      .signInWithPopup(googleProvider)
      .then(function (result) {
        cb(result)
      })
      .catch((e) => {
        console.log(e)
        dispatch({ type: actionTypes.SET_LOADING, payload: false })
      })
  } catch (e) {
    dispatch({ type: actionTypes.SET_LOADING, payload: false })
  }
}

// TODO
export const signInWithFacebook = () => {
  auth.signInWithPopup(facebookProvider)
}

/**
 *
 * Function used to sign in user using email and password. Firebase is used for authentication.
 * Once user is signed into firebase, the corresponding mongo user is fetched.
 *  (See SignUp page for this logic) If mongo user doesn't exist - a form is displayed to get the remaining info.
 *
 * @param {Object} state Context state
 * @param {Function} dispatch dispatch function returned by useReducer hook
 * @param {String} email
 * @param {String} password
 * @param {Function} getMongoUser see {@link getUserbyId}
 * @see module:User~getUserbyId
 * @function emailSignIn
 */
export const emailSignIn = (state, dispatch, email, password, getMongoUser) => {
  console.log(' emailSignIn')
  firebase
    .auth()
    .signInWithEmailAndPassword(email, password)
    .then((data) => {
      console.log(data)
      getMongoUser(data.user.uid)
    })
    .catch(function (error) {
      // Handle Errors here.
      dispatch({ type: actionTypes.SET_LOADING, payload: false })
      createNotification(state, dispatch, {
        type: 'error',
        autoHide: true,
        message:
          'You username or password is invalid. Perhaps you need to sign up first '
      })
      console.log(error)
      var errorCode = error.code
      var errorMessage = error.message
      // ...
    })
}

/**
 * Email sign up using firebase. If successful {@link createMongoUser} is passed the user object
 * received as response.
 * @param {Object} state Context state
 * @param {Function} dispatch dispatch function returned by useReducer hook
 * @param {String} email
 * @param {String} password
 * @param {Function} createMongoUser callback function , see {@link createMongoUser}
 * @function emailSignUp
 * @see module:User~createMongoUser
 */
export const emailSignUp = (
  state,
  dispatch,
  email,
  password,
  createMongoUser
) => {
  firebase
    .auth()
    .createUserWithEmailAndPassword(email, password)
    .then((data) => {
      createMongoUser(data.user)
    })
    .catch(function (error) {
      // Handle Errors here.
      createMongoUser(null)
      if (error.code === 'auth/email-already-in-use') {
        createNotification(state, dispatch, {
          type: 'error',
          autoHide: true,
          message: error.message
        })
      }

      console.log(error)
      var errorCode = error.code
      var errorMessage = error.message
      // ...
    })
}

/**
 * Function that fetches a mongo user give a userId
 * @param {Object} state Context state
 * @param {Function} dispatch dispatch function returned from useReducer hook
 * @param {Number} userId firebase uid
 * @param {Function} cb Callback to which response is passed to
 */
const getUserbyId = async (state, dispatch, userId, cb) => {
  try {
    const response = await axios.get(
      `http://localhost:3000/api/v1/users/${userId}`
    )
    console.log(response)
    return cb(response.data)
  } catch (e) {
    cb(null)
    console.log(e)
  }
}

/**
 *
 * @global
 * @typedef {Object} userObject Mongo user object - stored as `state.user`
 * @property {Number} uid same as firebase userId
 * @property {String} firstName
 * @property {String} lastName
 * @property {String} email unique
 * @property {Number} phoneNumber unique
 * @property {String} address
 * @property {Object} state not to be confused with Context state
 * @property {String} zipCode
 * @property {String} country
 * @property {String} profilePicture url
 * @property {Array<Number>} singles array of singleIds
 * @property {Array<Number>} albums array of albumIds
 */

/**
 *
 * Main function used for email sign up.
 * It creates a firebase email user first, then creates a mongo user
 * using the parameter {@link body}. Once the user is created in both
 * databases, a verification email is sent. If mongo fails
 * the user is deleted from firebase.
 *
 * NOTE- if {@link body.uid} is present - the function straight away creates a mongo
 * user and skips any firebase api calls as we only need the
 * firebase uid to create a mongo user and "link" it to firebase.
 *
 *
 * @param {userObject} body
 * @param {function} cb After all requests are successfull the user object returned from mongo is passed to the callback. Null is passed if anything fails.
 * @see userObject
 * @see module:User~createMongoUser
 * @see module:User~emailSignUp
 */
const createUser = (state, dispatch, body, cb) => {
  /**
   * Creates mongo user document. Sends email verification using firebase.
   * Handles firebase user deletion if user creation fails in mongo.
   * @param {Object} user firebase user object
   * @param {Boolean} isSocial Send email verification only if password sign up is used
   * @function createMongoUser
   */
  const createMongoUser = async (user, isSocial = false) => {
    try {
      const mongoUser = await axios.post('http://localhost:3000/api/v1/users', {
        ...body,
        uid: user.uid,
        isVerified: !!isSocial
      })
      !isSocial &&
        user
          .sendEmailVerification()
          .then(() => {
            console.log('Email verification sent')
          })
          .catch((e) => {
            console.log(e)
          })
      cb(mongoUser.data)
    } catch (e) {
      console.log(e)
      var userFb = firebase.auth().currentUser
      if (!!userFb & !isSocial) {
        userFb.delete().then(() => {
          console.log('user deleted')
          cb('handled')
        })
      }
      createNotification(state, dispatch, {
        type: 'error',
        autoHide: true,
        message:
          (!!e.response && e.response.data.msg) ||
          'Oops! Something went wrong.'
      })
    }
  }
  // If user is already logged into firebase (when using social sign up) - create user document only in mongo
  if (!body.uid) { emailSignUp(state, dispatch, body.email, body.password, createMongoUser) } else createMongoUser({ uid: body.uid }, true)
}

/**
 * Main function used to Sign in user.
 * Signs user into firebase and gets the user document from mongo
 * @param {Object} state Context state
 * @param {Function} dispatch dispatch function returned by useReducer hook
 * @param {String} type The type of login method used - email or google
 * @param {{email,password}} body
 * @param {function} cb callback
 * @see module:User~signInWithGoogle
 * @see module:User~getUserbyId
 * @see module:User~emailSignIn
 */
const signInUser = (type = 'email', state, dispatch, body, cb) => {
  const getMongoUser = async (uid) => {
    getUserbyId(state, dispatch, uid, cb)
  }
  const getMongoUserGoogle = async (result) => {
    getUserbyId(state, dispatch, result.user.uid, cb)
  }
  if (type === 'email') { emailSignIn(state, dispatch, body.email, body.password, getMongoUser) }
  if (type === 'google') signInWithGoogle(state, dispatch, getMongoUserGoogle)
}

/**
 * Sends a reset password email only if the email exists in firebase
 * and uses password sign-in
 * @param {Object} state
 * @param {Function} dispatch
 * @param {String} email
 * @function sendResetPassEmail
 */
export const sendResetPassEmail = (state, dispatch, email) => {
  dispatch({ type: actionTypes.FORM_LOADING, payload: true })
  firebase
    .auth()
    .fetchSignInMethodsForEmail(email)
    .then(function (signInMethods) {
      console.log(signInMethods)
      // This returns the same array as fetchProvidersForEmail but for email
      // provider identified by 'password' string, signInMethods would contain 2
      // different strings:
      // 'emailLink' if the user previously signed in with an email/link
      // 'password' if the user has a password.
      // A user could have both.
      if (
        signInMethods.indexOf(
          firebase.auth.EmailAuthProvider.EMAIL_PASSWORD_SIGN_IN_METHOD
        ) != -1
      ) {
        // User can sign in with email/password.
        auth
          .sendPasswordResetEmail(email)
          .then(function () {
            // Email sent.
            createNotification(state, dispatch, {
              type: 'success',
              autoHide: true,
              message: 'Email sent'
            })
          })
          .catch(function (error) {
            // An error happened.
          })
      }
      if (
        signInMethods.indexOf(
          firebase.auth.EmailAuthProvider.EMAIL_LINK_SIGN_IN_METHOD
        ) != -1
      ) {
        // User can sign in with email/link.
      }
      dispatch({ type: actionTypes.FORM_LOADING, payload: false })
    })
    .catch(function (error) {
      // Some error occurred, you can inspect the code: error.code
      console.log(error)
      dispatch({ type: actionTypes.FORM_LOADING, payload: false })
    })
}

/**
 * Emails a sign-in link to the email if it doesn't already exist in firebase
 * @param {Object} state
 * @param {Function} dispatch
 * @param {String} email
 * @function sendInviteEmail
 */
export const sendInviteEmail = (state, dispatch, email) => {
  var actionCodeSettings = {
    // URL you want to redirect back to. The domain (www.example.com) for this
    // URL must be whitelisted in the Firebase Console.
    url: 'http://localhost:3001/finishSignUp/' + email,
    // This must be true.
    handleCodeInApp: true
  }
  firebase
    .auth()
    .fetchSignInMethodsForEmail(email)
    .then(function (signInMethods) {
      console.log(signInMethods)
      if (signInMethods.length === 0) {
        firebase
          .auth()
          .sendSignInLinkToEmail(email, actionCodeSettings)
          .then(function () {
            console.log(email, 'sent')
            // The link was successfully sent. Inform the user.
            // Save the email locally so you don't need to ask the user for it again
            // if they open the link on the same device.
            window.localStorage.setItem('emailForSignIn', email)
          })
          .catch(function (error) {
            console.log(error)
            // Some error occurred, you can inspect the code: error.code
          })
      }
      // This returns the same array as fetchProvidersForEmail but for email
      // provider identified by 'password' string, signInMethods would contain 2
      // different strings:
      // 'emailLink' if the user previously signed in with an email/link
      // 'password' if the user has a password.
      // A user could have both.
      if (
        signInMethods.indexOf(
          firebase.auth.EmailAuthProvider.EMAIL_PASSWORD_SIGN_IN_METHOD
        ) != -1
      ) {
        // User can sign in with email/password.
        auth
          .sendPasswordResetEmail(email)
          .then(function () {
            // Email sent.
          })
          .catch(function (error) {
            // An error happened.
          })
      }
      if (
        signInMethods.indexOf(
          firebase.auth.EmailAuthProvider.EMAIL_LINK_SIGN_IN_METHOD
        ) != -1
      ) {
        // User can sign in with email/link.
      }
      createNotification(state, dispatch, {
        type: 'success',
        autoHide: true,
        message:
          'We have sent a sign-in invite to ' +
          email +
          ' if the user is not already in our records'
      })
    })
    .catch(function (error) {
      // Some error occurred, you can inspect the code: error.code
      console.log(error)
    })
}

export default {
  getUserbyId,
  createUser,
  signInUser,
  sendInviteEmail
}
