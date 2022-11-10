
"""

arr = [1, 2, 3, 4, 5, 9]


def find(val, startInd, endInd):
    
    if (startInd == endInd):
        return startInd if (val == arr[startInd]) else -1
    
    # Pivot or median 
    midIndex = (endInd + startInd) / 2

    if (val > arr[midIndex]):
        return find(val, midIndex+1, endInd)
    elif (val < arr[midIndex]):
        return find(val, startInd, midIndex-1)
    else:
        return midIndex

    return -1


returnVal = find(3, 0, len(arr) - 1)

print(find(3, 0, len(arr) - 1))
print(find(10, 0, len(arr) - 1))
print(find(5, 0, len(arr) - 1))
print(find(9, 0, len(arr) - 1))
"""


def validString(str):
    types = {"(": ")", 
            "{":"}",
             "[":"]"}
    tempArr = [] 
    firstTime = False


    for element in str:
        if element in types: # Opening exists in types
            tempArr.append(element)
        elif types[tempArr.pop()] != element:
            return False
        
    return len(tempArr) == 0 

print(validString("{)"))
print(validString("()[]"))
print(validString("([])"))
print(validString("(([])"))
print(validString("asdajksbd"))