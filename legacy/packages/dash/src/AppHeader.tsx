import React from 'react';
import { StyleSheet, Text, View } from '@rn';

export default function AppHeader() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>asdf</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    height: 200,
    backgroundColor: '#f3f3f3',
  },
  text: {
    fontSize: 36,
    fontWeight: '600',
  },
});